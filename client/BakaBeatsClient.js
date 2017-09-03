const fs = require('fs');
const path = require('path');
const mm = require('musicmetadata');
const mp3Duration = require('mp3-duration');
const lame = require('lame');

const STREAM_SOURCE = './source.mp3';
const STREAM_BUFFER = './stream.mp3';
const BUFFER_SIZE = 1024 * 1024;

const ErrorCode = {
  CODEC_NOT_SUPPORTED: 'CODEC NOT SUPPORTED'
};

const Codec = {
  LAME: 'LAME'
};

class AudioFile {
  constructor(loc) {
    this.location = loc;
    this.buffer = 0;
    this.bytesRead = 0;
    this.bytesPerSecond = 0;
    this.contentLength = fs.statSync(loc)["size"];
    this.metadata = {};
  }
}

/**
 * It's not like I play music or anything!
 */
class BakaBeatsClient {

  constructor() {
    this.playlist = [];
    this.currentSong;
  }
  
  /**
   * Builds a playlist of audio files (right now .mp3 specifically)
   * @param {string} src Root folder for audio files
   */ 
  buildPlaylist(source) {
    console.info("Playing music files from: " + source);
    let s = []; // Data structure used for depth first search (DFS) aka a recursive .mp4 search starting at the folder path provided  
    let m = {}; // Temporary data structure for marking visited folders in DFS        
    s.push(source); // Add root

    // Recursively search for audio files and add to the playlist
    while (s.length > 0) {
      let dir = s[s.length-1];
      console.info("Traversing " + dir + ":");
      let files = fs.readdirSync(dir);  
      let end = true;
      
      // Iterate through folder children
      for(var i = 0; i < files.length; i++) {
        let fPath = path.join(dir, files[i]);
        
        // Add item to playlist if it is a file, else continue search
        if (fs.statSync(path.join(dir, files[i])).isFile()) {
          let arr = files[i].split("\.");
          let ext = arr[arr.length-1];      
          if (ext === "mp3") {
            console.info("Adding file " + files[i] + " to queue.");
            this.playlist.push(fPath);
          }
        }
        else if (!m.hasOwnProperty(fPath)) {
          console.info("Found folder " + files[i] + "!");
          s.push(fPath);
          end = false;
          break;
        }
      }

      // Mark folder as visited
      if (end) m[s.pop()] = true;
    }

    // Playlist is done!!
    console.info("Queued " +  this.playlist.length + " items.");
  }
  
  /**
   * Start playlist
   */
  start() {
    console.info('STARTING - Starting stream...');
    this.applyCodec(this.playlist[0], Codec.LAME).then(() => {
       this.getAudioFile(this.playlist[0])
        .then((audioFile) => {
          this.play(audioFile)
            .then(() => {
              console.info('I finished playing something!');
            });
       });
    });
  }
  
  /**
   * Gets audio file metadata and returns new audio file object
   * @param {string} location Path to audio file
   * @param {Promise} Resolves as an audio file
   */
  getAudioFile(location) {
    // Create new audio file object
    let audioFile = new AudioFile(location);
    
    // Audio file stream
    let metadataStream = fs.createReadStream(location);
    
    // Read audio file stream for metadata, if the duration isn't available, try an additional library
    return new Promise((resolve, reject) => {
      mm(metadataStream, (err, metadata) => {
        if (err) reject(err);
        metadataStream.close();        
        resolve(metadata);
      })
    })
    .then((metadata) => {
      audioFile.metadata = metadata;
      if (audioFile.metadata.duration == 0) {
        return new Promise((resolve, reject) => {
          mp3Duration(location, (err, duration) => {
            if (err) reject(err);
            audioFile.metadata.duration = duration;
            audioFile.bytesPerSecond = Math.floor(audioFile.contentLength / duration);
            resolve(audioFile);
          });
        });
      }
    });
  }
  
  applyCodec(audioFile, codec) {
    return new Promise((resolve, reject) => {
      if (!['LAME'].includes(codec))
        reject(new Error(ErrorCode.CODEC_NOT_SUPPORTED));
      
      let sourceStream = fs.createReadStream(audioFile);
      let targetStream = fs.createWriteStream(STREAM_SOURCE);
      
      let encoder = new lame.Encoder({
        // input
        channels: 2,        // 2 channels (left and right)
        bitDepth: 16,       // 16-bit samples
        sampleRate: 44100,  // 44,100 Hz sample rate
        // output
        bitRate: 320,
        outSampleRate: 44100,
        mode: lame.STEREO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
      });
      let decoder = new lame.Decoder();
      
      decoder.on('format', (format) => {
        console.error('DECODED - MP3 format: %j', format);
        console.info('ENCODING - Encoding using the codec ' + codec);            
        let stream = decoder.pipe(encoder).pipe(targetStream);
        targetStream.on('finish', () => {
          console.info('ENCODING COMPLETE - Stream compatibile file created');
          resolve();
        });
      });      
      sourceStream.pipe(decoder);
      
    }).catch((e) => {
      console.error(e.stack);
    });
  }
  
  /**
   * Write chunks of the audio file to the stream file
   * @param {number} i Index of audio file in playlist
   * @return {Promise}
   */
  play(audioFile) {
    return new Promise((resolve, reject) => {      
      // Set current song to audio file
      this.currentSong = audioFile;          
      console.info(`PLAYING - Playing ${this.currentSong.metadata.title} by ${this.currentSong.metadata.artist}...`);  

      // Create audio file stream
      //this.currentSong.location
      let songStream = fs.createReadStream(STREAM_SOURCE, {highWaterMark: this.currentSong.bytesPerSecond * 30});    

      // Create stream cache to write to
      let streamBuffer = fs.createWriteStream(STREAM_BUFFER);

      // Start streaming data
      this.stream('STREAMING', songStream, streamBuffer, this.currentSong.contentLength, 1000, 
        (target) => {            
          //let fd = fs.openSync(STREAM_FILE, 'r+');
          //fs.ftruncateSync(fd, 1000);
        },
        (bytesRead, buffer) => { 
          this.currentSong.bytesRead = bytesRead;
          this.currentSong.buffer = buffer;
        });

      // Current song ends
      songStream.on('end', () => {
        console.info(`STREAM END - ${this.currentSong.location} finished! Played ${this.currentSong.bytesRead} bytes.`);
        resolve();
      });    
    }).catch((e) => {
      console.log(e.stack);
    });
  }

  /**
   * Reads stream buffer and write it to stream
   * @param {WriteStream} strea Stream to pipe stream cache to
   */
  listen(stream) {
    if (this.currentSong) {
      let listeningStream = fs.createReadStream(STREAM_BUFFER, {highWaterMark: 314000});
      console.info(`Listening to ${this.currentSong.metadata.title} by ${this.currentSong.metadata.artist}...`);  

      this.stream('LISTENING', listeningStream, stream, this.currentSong.contentLength, 1000);

      listeningStream.on('end', () => {
        console.info(`STREAM END - ${this.currentSong.location} finished! Listened to ${listeningStream.bytesRead} bytes.`);
      });
    }
    else {
      console.info('WAITING - Waiting for stream to start..');
    }
  }
  
  /**
   * Stream data from one source to another
   * @param {string} type Type of activity
   * @param {ReadStream} source Stream to read from
   * @param {WriteStream} target Sream to write to
   * @param {function} onStream Optional handler for when bytes are written
   * @param {function} onRead Optional handler for when bytes are read
   */
  stream(type, source, target, contentLength, bufferSpeed, onStream, onRead) {
    let buffer = 0;
    let count = 0;
    source.on('data', (chunk) => {
      // Update buffer
      buffer += chunk.length;      
      console.info(`${type} - Chunk: ${chunk.length} bytes, Buffer: ${buffer} bytes, Read: ${source.bytesRead} bytes`);

      // If byte count > BUFFER_SIZE, pause the stream
      // The pause is to give the listening stream enough time to read what it needs before flushing out the buffer
      // TODO: maybe put a hook for the listening stream?
      source.pause();
      source.unpipe();

      // Delay stream
      // TODO: Should I just remove this? Is there an easy way to chunk the decoder?
      setTimeout(() => {
        console.info('FLUSHING - Flushing buffer and resuming stream');                    
        buffer = 0;
        source.resume(); 
        source.pipe(target);

        if (onStream) {
          onStream(target);  
        }

      }, bufferSpeed);
      
      if (onRead) {
        onRead(source.bytesRead, buffer);
      }
    });    
    source.pipe(target);
  }
}

module.exports = BakaBeatsClient;