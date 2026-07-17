let io;

module.exports = {
  init: (server, allowedOrigins) => {
    const { Server } = require("socket.io");
    io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        credentials: true
      }
    });
    
    io.on("connection", (socket) => {
      socket.on("join-room", (roomName) => {
        socket.join(roomName);
      });
      
      socket.on("leave-room", (roomName) => {
        socket.leave(roomName);
      });
    });
    
    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  }
};
