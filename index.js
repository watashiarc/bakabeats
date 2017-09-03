const http = require('http');
const port = 1337;

const bakaBeatsClient = new (require('./client/BakaBeatsClient.js'))();

const requestHandler = (req, res) => {  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('CF-RAY', '33484d54a0ec0c41-SEA');
  res.setHeader('Content-Type', 'audio/mp3');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control',' no-cache');
  res.setHeader('Expires', 'Mon, 26 Jul 1997 05:00:00 GMT');
  res.setHeader('icy-description', 'Your weeaboo station');
  res.setHeader('icy-name', 'R/a/dio');
  res.setHeader('icy-pub', 0);
  res.setHeader('Pragma', 'no-cache');
  bakaBeatsClient.listen(res);
}

const server = http.createServer(requestHandler);
server.listen(port, (err) => {  
  if (err) {
    return console.log('Something bad happened', err)
  }
//  let ogg = require('ogg');
//  let lame = require('lame');
//  let vorbis = require('vorbis');
  console.log(`Server is listening on ${port}`)
  bakaBeatsClient.buildPlaylist('X:/music/Anime OST/2015/&Z  SawanoHiroyuki[nZk]');
  bakaBeatsClient.start();
});
