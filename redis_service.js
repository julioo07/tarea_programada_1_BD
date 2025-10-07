require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Importar servicios Redis
const { 
  connectRedis, 
  notificationService, 
  messagingService, 
  cacheService,
  realtimeService 
} = require('./redisService');

const app = express();

// Configuración de CORS
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false
}));
app.options(/.*/, cors());

app.use(express.json({ limit: '5mb' }));

// Conectar Redis al iniciar
connectRedis().catch(console.error);



// Seguir usuario
app.post('/api/users/:userId/follow', async (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.sub;

  try {
    await notificationService.followUser(followerId, userId);
    res.json({ message: 'Usuario seguido correctamente' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'Error al seguir usuario' });
  }
});

// Obtener notificaciones
app.get('/api/notifications', async (req, res) => {
  const userId = req.user.sub;

  try {
    const notifications = await notificationService.getNotifications(userId);
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
});

// Enviar mensaje
app.post('/api/messages', async (req, res) => {
  const { receiverId, message } = req.body;
  const senderId = req.user.sub;

  try {
    const messageData = await messagingService.sendMessage(senderId, receiverId, message);
    res.json({ message: 'Mensaje enviado', data: messageData });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Error al enviar mensaje' });
  }
});

// Obtener conversación
app.get('/api/messages/:otherUserId', async (req, res) => {
  const { otherUserId } = req.params;
  const userId = req.user.sub;

  try {
    const messages = await messagingService.getConversation(userId, otherUserId);
    res.json({ messages });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Error al obtener conversación' });
  }
});

// Votar dataset
app.post('/api/datasets/:datasetId/vote', async (req, res) => {
  const { datasetId } = req.params;
  const { vote } = req.body;
  const userId = req.user.sub;

  try {
    await cacheService.cacheUserVote(userId, datasetId, vote);
    res.json({ message: 'Voto registrado', vote });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ message: 'Error al registrar voto' });
  }
});

// Cache de búsqueda
app.get('/api/datasets/search', async (req, res) => {
  const { q } = req.query;
  const cacheKey = `search:${q}`;

  try {
    // Intentar obtener del cache primero
    const cached = await cacheService.getCachedDatasets(cacheKey);
    if (cached) {
      return res.json({ datasets: cached, fromCache: true });
    }

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error en búsqueda' });
  }
});

// Estadísticas de Redis (para desarrollo)
app.get('/api/dev/redis-stats', async (req, res) => {
  try {
    const stats = await cacheService.getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('Redis stats error:', error);
    res.status(500).json({ message: 'Error obteniendo estadísticas' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});