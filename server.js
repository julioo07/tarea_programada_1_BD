const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json()); // Para poder recibir JSON en las peticiones

// Configuración de MongoDB
const uri = 'mongodb://localhost:27017/datasets_bd'; // Incluye la BD en la URI
const client = new MongoClient(uri);

// Variable para almacenar la conexión
let db;

// Conectar al iniciar el servidor
async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log('✅ Conectado a MongoDB - datasets_bd');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  }
}

// Ruta para obtener todos los datasets
app.get('/api/datasets', async (req, res) => {
  try {
    const datasets = await db.collection('datasets').find().toArray();
    res.json(datasets);
  } catch (err) {
    console.error('Error obteniendo datasets:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/datasets/:id_dataset', async (req, res) => {
  try {
    const { id_dataset } = req.params;
    const dataset = await db.collection('datasets').findOne({ id_dataset });
    if (!dataset) return res.status(404).json({ error: 'No encontrado' });
    res.json(dataset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Ruta para obtener datasets por usuario
app.get('/api/datasets/usuario/:id_usuario', async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const datasets = await db.collection('datasets')
      .find({ id_usuario: id_usuario })
      .toArray();
    res.json(datasets);
  } catch (err) {
    console.error('Error obteniendo datasets por usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para buscar datasets por nombre
app.get('/api/datasets/buscar/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;
    const datasets = await db.collection('datasets')
      .find({ 
        nombre: { $regex: nombre, $options: 'i' } // Búsqueda case insensitive
      })
      .toArray();
    res.json(datasets);
  } catch (err) {
    console.error('Error buscando datasets:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para crear un nuevo dataset
app.post('/api/datasets', async (req, res) => {
  try {
    const nuevoDataset = {
      ...req.body,
      fecha_inclusion: new Date(),
      fecha_actualizacion: new Date(),
      estado: 'activo'
    };
    
    const resultado = await db.collection('datasets').insertOne(nuevoDataset);
    res.status(201).json({ 
      mensaje: 'Dataset creado exitosamente',
      id: resultado.insertedId 
    });
  } catch (err) {
    console.error('Error creando dataset:', err);
    res.status(500).json({ error: err.message });
  }
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('Cerrando conexión a MongoDB...');
  await client.close();
  process.exit(0);
});

// Iniciar servidor
app.listen(3000, async () => {
  await connectDB();
  console.log('🚀 Servidor escuchando en http://localhost:3000');
});