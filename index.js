const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPR_SECRET_KEY);

// middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://need-blood-8367e.web.app",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.elqupzc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// console.log(process.env.ACCESS_TOKEN_SECRET);

// verify jwt middleware
const verifyToken = async (req, res, next) => {
  console.log("inside verify token :", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const usersCollection = client.db("needBlood").collection("all-users");
    const blogCollection = client.db("needBlood").collection("blogs");
    const districtsCollection = client.db("needBlood").collection("districts");
    const upazilasCollection = client.db("needBlood").collection("upazilas");
    const paymentCollection = client.db("needBlood").collection("payments");
    const donationRequestCollection = client
      .db("needBlood")
      .collection("donationReq");

    app.get("/", async (req, res) => {
      res.send("server is running");
    });

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // verify volunteer
    // const verifyVolunteer = async (req, res, next) => {
    //   const email = req.decoded.email;
    //   const query = { email };
    //   const user = await usersCollection.findOne(query);
    //   const isVolunteer = user?.role === "Volunteer";
    //   if (!isVolunteer) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }
    //   next();
    // };
    // jwt Token

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res.send({ token });
    });

    // =============== Admin Api's =====================

    // get the user role  ,verify token
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      const getRole = user.role;
      res.send({ getRole });
    });

    // get total donors and donation req
    app.get("/overview/donors-requests", verifyToken, async (req, res) => {
      const query = { role: "Donor" };
      const donors = await usersCollection.countDocuments(query);

      const donationReq =
        await donationRequestCollection.estimatedDocumentCount();

      // Calculate total payment amount using aggregation
      const totalAmount = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$price" }, // Assuming 'price' is the field for payment amount
            },
          },
        ])
        .toArray();

      // Extract the total amount from the aggregation result
      const total = totalAmount[0]?.total || 0;

      res.send({ donors, donationReq, total });
    });

    // admin access : update status (active/block)=>
    app.patch("/status/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const user = await usersCollection.findOne(query);

      const newStatus = user.status === "active" ? "blocked" : "active";

      const updateDoc = {
        $set: {
          status: newStatus,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // admin access : update user role
    app.patch("/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role: newRole } = req.body;

      const validRoles = ["Donor", "Volunteer", "Admin"];
      if (!validRoles.includes(newRole)) {
        return res.status(400).send({ message: "Invalid role for update" });
      }

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: newRole,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update the blood req status => only updated volunteer and donor who donate blood
    app.patch("/blood-req-status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const donationReq = await donationRequestCollection.findOne(query);

      if (donationReq.status === "pending") {
        const updateDoc = {
          $set: {
            status: "in progress",
          },
        };
        const result = await donationRequestCollection.updateOne(
          query,
          updateDoc
        );
        res.send(result);
      }
    });

    // update the blood status for only donor => just cancle and done(only donor)
    app.patch("/blood-status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // Get status from request body
      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await donationRequestCollection.updateOne(
        query,
        updateDoc
      );
      res.send(result);
    });

    // blog post api
    app.post("/add-blog", verifyToken, async (req, res) => {
      const blog = req.body;
      const result = await blogCollection.insertOne(blog);
      res.send(result);
    });

    // get all blogs=>admin volunteer
    app.get("/all-blogs", verifyToken, async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });

    // get a single blog based on id
    app.get("/blog/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogCollection.findOne(query);
      res.send(result);
    });

    // only admin can published a blog
    app.patch(
      "/blog-published/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const blog = await blogCollection.findOne(query);
        // Toggle the status between "published" and "draft"
        const newStatus = blog.status === "published" ? "draft" : "published";

        const updateDoc = {
          $set: {
            status: newStatus,
          },
        };
        const result = await blogCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // get only published blog
    app.get("/blog-published", async (req, res) => {
      const query = { status: "published" };
      const result = await blogCollection.find(query).toArray();
      res.send(result);
    });

    // only admin can delete a blog
    app.delete("/blog/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogCollection.deleteOne(query);
      res.send(result);
    });

    // =============== User's Api's ====================

    // all user -> post on registration
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get all users data
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const page = parseInt(req.query.page);
      const count = parseInt(req.query.count);
      console.log(count, page);

      const requestingUserEmail = req.decoded.email;
      const query = { email: { $ne: requestingUserEmail } };
      // console.log(requestingUserEmail);
      const result = await usersCollection
        .find(query)
        .skip(count * (page - 1)) // Skip documents based on page and count
        .limit(count)
        .toArray();
      res.send(result);
    });

    // count for pagination
    app.get("/users-count", async (req, res) => {
      const count = await usersCollection.estimatedDocumentCount();
      res.send({ count });
    });

    // get a specific user based on email
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // update user data based on email => put
    app.put("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // search user
    app.get("/search-donors", async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;
      const query = {};

      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (district) query.district = district;
      if (upazila) query.upazila = upazila;

      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // ============== Donations Api's =====================

    // donation request => post
    app.post("/donation-request", verifyToken, async (req, res) => {
      const donation = req.body;

      // Check if the user's status is active
      const query = { email: donation.email };
      const user = await usersCollection.findOne(query);

      if (user && user.status === "active") {
        donation.createdAt = new Date();
        const result = await donationRequestCollection.insertOne(donation);
        res.send(result);
      } else {
        res.send({ message: "Your Account is Blocked" });
      }
    });

    // get all donation req admin , volentter
    app.get("/all-donation-req", verifyToken, async (req, res) => {
      const result = await donationRequestCollection.find().toArray();
      res.send(result);
    });

    // get all donation req which have the status pending
    app.get("/donation-req", async (req, res) => {
      const query = { status: "pending" };
      const result = await donationRequestCollection.find(query).toArray();
      res.send(result);
    });

    // get a single donation req data basen on id => get
    app.get("/donation/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationRequestCollection.findOne(query);
      res.send(result);
    });

    // delete donation request based on id => delete
    app.delete("/donation-request/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationRequestCollection.deleteOne(query);
      res.send(result);
    });

    // update donation request data => put
    app.put("/donation-update/:id", async (req, res) => {
      const id = req.params.id;
      const donation = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...donation,
        },
      };
      const result = await donationRequestCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // donation request based on email => get
    app.get("/donation-request/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await donationRequestCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    //========== District and Upazilas Api's ================

    // get all districts
    app.get("/districts", async (req, res) => {
      const result = await districtsCollection.find().toArray();
      res.send(result);
    });

    // get all upazilas based on district id
    app.get("/upazilas", async (req, res) => {
      const districtId = req.query.district_id;
      const query = { district_id: districtId };
      const filteredUpazilas = await upazilasCollection.find(query).toArray();
      res.send(filteredUpazilas);
    });

    // ================= Payment's Api's ===========================

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // post all payments =>
    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // get all payments =>
    app.get("/all-payments", verifyToken, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
