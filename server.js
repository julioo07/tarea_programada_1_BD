const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json()); // Para poder recibir JSON en las peticiones

// Configuración de MongoDB
const uri = 'mongodb://localhost:27017/datasets_bd'; // Incluye la BD en la URI
const client = new MongoClient(uri);

// Variable para almacenar la conexión
let db;


// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Carpeta donde se guardan los archivos
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // Nombre único
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());


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



// Ruta para crear un nuevo dataset con archivos
app.post('/api/datasets', upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'archivos' },
  { name: 'foto_repositorio', maxCount: 1 },
  { name: 'videos_guia' }
]), async (req, res) => {
  try {
    // Construye el objeto dataset con los archivos subidos
    const nuevoDataset = {
      id_dataset: req.body.id_dataset,
      id_usuario: req.body.id_usuario,
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      fecha_inclusion: new Date(req.body.fecha_inclusion),
      fecha_actualizacion: new Date(),
      estado: 'activo',
      avatar: req.files['avatar'] ? {
        nombre_archivo: req.files['avatar'][0].filename,
        ruta: '/uploads/' + req.files['avatar'][0].filename,
        tipo: req.files['avatar'][0].mimetype,
        tamaño: req.files['avatar'][0].size
      } : null,
      archivos: req.files['archivos'] ? req.files['archivos'].map(f => ({
        nombre_archivo: f.filename,
        ruta: '/uploads/' + f.filename,
        tipo: f.mimetype,
        tamaño: f.size,
        fecha_subida: new Date()
      })) : [],
      foto_repositorio: req.files['foto_repositorio'] ? {
        nombre_archivo: req.files['foto_repositorio'][0].filename,
        ruta: '/uploads/' + req.files['foto_repositorio'][0].filename,
        tipo: req.files['foto_repositorio'][0].mimetype,
        tamaño: req.files['foto_repositorio'][0].size
      } : null,
      videos_guia: req.files['videos_guia'] ? req.files['videos_guia'].map(f => ({
        titulo: f.originalname,
        nombre_archivo: f.filename,
        ruta: '/uploads/' + f.filename,
        tipo: f.mimetype,
        tamaño: f.size,
        duracion: "" // Puedes agregar lógica para obtener duración si lo necesitas
      })) : []
    };

    const resultado = await db.collection('datasets').insertOne(nuevoDataset);
    res.status(201).json({ mensaje: 'Dataset creado exitosamente', id: resultado.insertedId });
  } catch (err) {
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