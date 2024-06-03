const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

// middlewares
app.use(express.json());
app.use(cors());

// tahidtaha997
// 0nSMgjyV3lbrCA9S

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.elqupzc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const usersCollection = client.db("needBlood").collection("all-users");
    const districtsCollection = client.db("needBlood").collection("districts");
    const upazilasCollection = client.db("needBlood").collection("upazilas");
    const donationRequestCollection = client
      .db("needBlood")
      .collection("donationReq");

    app.get("/", async (req, res) => {
      res.send("server is running");
    });

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
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // get a specific user based on email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // donation request => on donor post
    app.post("/donation-request", async (req, res) => {
      const donation = req.body;
      const result = await donationRequestCollection.insertOne(donation);
      res.send(result);
    });

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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
