const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

app.get('/api/datasets', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('datasets_bd');
    const datasets = await db.collection('datasets').find().toArray();
    res.json(datasets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Servidor escuchando en http://localhost:3000');
});