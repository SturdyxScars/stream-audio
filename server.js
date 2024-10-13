const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));  // Serve static files

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('audio-stream', (data) => {
    socket.broadcast.emit('audio-stream', data);  // Broadcast to other clients
  });

  socket.on('control', (data) => {
    socket.broadcast.emit('control', data);  // Broadcast play/stop controls
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
