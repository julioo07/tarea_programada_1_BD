const redis = require('redis');

// Configuración de Redis
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
  }
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Conectar Redis
const connectRedis = async () => {
  await redisClient.connect();
  console.log('✅ Conectado a Redis');
};


// Servicio de Notificaciones
const notificationService = {
  // Seguir usuario
  async followUser(followerId, followingId) {
    const key = `followers:${followingId}`;
    await redisClient.sAdd(key, followerId);
    
    // Agregar notificación
    await this.addNotification(followingId, {
      type: 'new_follower',
      followerId: followerId,
      timestamp: new Date().toISOString(),
      read: false
    });
  },

  // Dejar de seguir
  async unfollowUser(followerId, followingId) {
    const key = `followers:${followingId}`;
    await redisClient.sRem(key, followerId);
  },

  // Agregar notificación
  async addNotification(userId, notification) {
    const key = `notifications:${userId}`;
    await redisClient.lPush(key, JSON.stringify(notification));
    await redisClient.lTrim(key, 0, 99); // Mantener últimas 100 notificaciones
  },

  // Obtener notificaciones
  async getNotifications(userId) {
    const key = `notifications:${userId}`;
    const notifications = await redisClient.lRange(key, 0, -1);
    return notifications.map(notif => JSON.parse(notif));
  },

  // Marcar notificación como leída
  async markNotificationAsRead(userId, notificationIndex) {
    const key = `notifications:${userId}`;
    const notifications = await redisClient.lRange(key, 0, -1);
    if (notifications[notificationIndex]) {
      const notif = JSON.parse(notifications[notificationIndex]);
      notif.read = true;
      await redisClient.lSet(key, notificationIndex, JSON.stringify(notif));
    }
  },

  // Obtener seguidores
  async getFollowers(userId) {
    const key = `followers:${userId}`;
    return await redisClient.sMembers(key);
  },

  // Verificar si un usuario sigue a otro
  async isFollowing(followerId, followingId) {
    const key = `followers:${followingId}`;
    return await redisClient.sIsMember(key, followerId);
  },

  // Obtener cantidad de seguidores
  async getFollowersCount(userId) {
    const key = `followers:${userId}`;
    return await redisClient.sCard(key);
  }
};

// Servicio de Mensajería
const messagingService = {
  // Enviar mensaje
  async sendMessage(senderId, receiverId, message) {
    const conversationKey = `conversation:${this.getConversationId(senderId, receiverId)}`;
    const messageData = {
      id: Date.now().toString(),
      senderId,
      receiverId,
      message,
      timestamp: new Date().toISOString(),
      read: false
    };

    await redisClient.lPush(conversationKey, JSON.stringify(messageData));
    await redisClient.lTrim(conversationKey, 0, 999); // Máximo 1000 mensajes

    return messageData;
  },

  // Obtener conversación
  async getConversation(user1Id, user2Id) {
    const conversationKey = `conversation:${this.getConversationId(user1Id, user2Id)}`;
    const messages = await redisClient.lRange(conversationKey, 0, -1);
    return messages.map(msg => JSON.parse(msg)).reverse();
  },

  // Marcar mensajes como leídos
  async markMessagesAsRead(user1Id, user2Id) {
    const conversationKey = `conversation:${this.getConversationId(user1Id, user2Id)}`;
    const messages = await redisClient.lRange(conversationKey, 0, -1);
    
    for (let i = 0; i < messages.length; i++) {
      const msg = JSON.parse(messages[i]);
      if (msg.receiverId === user1Id && !msg.read) {
        msg.read = true;
        await redisClient.lSet(conversationKey, i, JSON.stringify(msg));
      }
    }
  },

  // Obtener conversaciones recientes de un usuario
  async getUserConversations(userId) {
    const pattern = `conversation:*${userId}*`;
    const keys = await redisClient.keys(pattern);
    const conversations = [];
    
    for (const key of keys) {
      const lastMessage = await redisClient.lIndex(key, 0);
      if (lastMessage) {
        const message = JSON.parse(lastMessage);
        const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
        conversations.push({
          otherUserId,
          lastMessage: message,
          unreadCount: await this.getUnreadCount(key, userId)
        });
      }
    }
    
    return conversations;
  },

  // Obtener cantidad de mensajes no leídos
  async getUnreadCount(conversationKey, userId) {
    const messages = await redisClient.lRange(conversationKey, 0, -1);
    return messages.filter(msg => {
      const message = JSON.parse(msg);
      return message.receiverId === userId && !message.read;
    }).length;
  },

  getConversationId(user1Id, user2Id) {
    return [user1Id, user2Id].sort().join('_');
  }
};

// Servicio de Cache
const cacheService = {
  // Cache de datasets
  async cacheDatasets(key, datasets, ttl = 3600) {
    await redisClient.setEx(`datasets:${key}`, ttl, JSON.stringify(datasets));
  },

  async getCachedDatasets(key) {
    const cached = await redisClient.get(`datasets:${key}`);
    return cached ? JSON.parse(cached) : null;
  },

  // Cache de datasets de usuario
  async cacheUserDatasets(userId, datasets, ttl = 1800) {
    await redisClient.setEx(`user_datasets:${userId}`, ttl, JSON.stringify(datasets));
  },

  async getCachedUserDatasets(userId) {
    const cached = await redisClient.get(`user_datasets:${userId}`);
    return cached ? JSON.parse(cached) : null;
  },

  // Cache de votos
  async cacheUserVote(userId, datasetId, vote) {
    await redisClient.hSet(`user_votes:${userId}`, datasetId, vote.toString());
  },

  async getUserVote(userId, datasetId) {
    const vote = await redisClient.hGet(`user_votes:${userId}`, datasetId);
    return vote ? parseInt(vote) : null;
  },

  // Obtener todos los votos de un usuario
  async getUserVotes(userId) {
    const votes = await redisClient.hGetAll(`user_votes:${userId}`);
    const result = {};
    for (const [datasetId, vote] of Object.entries(votes)) {
      result[datasetId] = parseInt(vote);
    }
    return result;
  },

  async addOnlineUser(userId) {
    await redisClient.sAdd('online_users', userId);
  },

  async removeOnlineUser(userId) {
    await redisClient.sRem('online_users', userId);
  },

  async getOnlineUsers() {
    return await redisClient.sMembers('online_users');
  },

  async isUserOnline(userId) {
    return await redisClient.sIsMember('online_users', userId);
  },

  // Limpiar cache por patrón
  async invalidateCache(pattern) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  },

  // Estadísticas de cache
  async getCacheStats() {
    const patterns = [
      'datasets:*',
      'user_datasets:*', 
      'user_votes:*',
      'notifications:*',
      'followers:*',
      'conversation:*',
      'online_users'
    ];
    
    const stats = {};
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      stats[pattern] = keys.length;
    }
    
    return stats;
  }
};

// Servicio de Tiempo Real (para WebSockets)
const realtimeService = {
  async subscribeToUser(subscriberId, targetUserId) {
    const key = `user_subscriptions:${subscriberId}`;
    await redisClient.sAdd(key, targetUserId);
  },

  async unsubscribeFromUser(subscriberId, targetUserId) {
    const key = `user_subscriptions:${subscriberId}`;
    await redisClient.sRem(key, targetUserId);
  },

  // Obtener usuarios a los que está suscrito
  async getUserSubscriptions(userId) {
    const key = `user_subscriptions:${userId}`;
    return await redisClient.sMembers(key);
  },

  // Obtener suscriptores de un usuario
  async getUserSubscribers(userId) {
    const pattern = `user_subscriptions:*`;
    const keys = await redisClient.keys(pattern);
    const subscribers = [];
    
    for (const key of keys) {
      const subscriberId = key.split(':')[1];
      const isSubscribed = await redisClient.sIsMember(key, userId);
      if (isSubscribed) {
        subscribers.push(subscriberId);
      }
    }
    
    return subscribers;
  },

  // Almacenar sesiones de Socket.io
  async storeSocketSession(userId, socketId) {
    await redisClient.set(`socket:${userId}`, socketId);
    await redisClient.set(`user:${socketId}`, userId);
  },

  async getSocketId(userId) {
    return await redisClient.get(`socket:${userId}`);
  },

  async getUserId(socketId) {
    return await redisClient.get(`user:${socketId}`);
  },

  async removeSocketSession(userId, socketId) {
    await redisClient.del(`socket:${userId}`);
    await redisClient.del(`user:${socketId}`);
  }
};

module.exports = {
  redisClient,
  connectRedis,
  notificationService,
  messagingService,
  cacheService,
  realtimeService
};