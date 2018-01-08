const express = require('express');
const _ = require('lodash');

const mkdirp = require('mkdirp');
const path = require('path');
const multer = require('multer');
const lowdb = require('lowdb');
const FileAsync = require('lowdb/adapters/FileAsync');
const uuidv4 = require('uuid/v4');
const fs = require('fs');
const sharp = require('sharp');

const app = express();

const adapter = new FileAsync('db.json');
const db = (async connection => {
  const dbConnection = await connection;
  await dbConnection.defaults({ resource: [], users: [] }).write();
  return dbConnection;
})(lowdb(adapter));

// Routes
const packageJson = require('./package.json');
// Root
app.get('/', (req, res) =>
  res.json(
    _.pick(packageJson, ['name', 'version', 'description', 'author', 'license'])
  )
);

const allowTypes = process.env.ALLOW_TYPES.split(',').map(data => data.trim());

const uploadConfig = {
  fields: process.env.MAX_FIELD || 17,
  files: process.env.MAX_FILE || 17,
  fileSize: (process.env.MAX_SIZE || 100) * 1048576,
  parts: process.env.MAX_PART || 17
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const today = new Date();
    const dd = today.getDate();
    const mm = today.getMonth() + 1;
    const yyyy = today.getFullYear();
    // const uploadPath = `public/resource/${yyyy}/${mm}/${dd}`;
    const uploadPath = `public/resource`;
    // mkdirp(`${uploadPath}`);
    cb(null, `${path.resolve(__dirname, uploadPath)}`);
  },
  filename(req, { originalname, mimetype }, cb) {
    const nameSegments = originalname.split('.');
    const name = nameSegments[0] || `${Date.now()}`;

    const mineTypeSegments = mimetype.split('/');
    const ext = mineTypeSegments[1] || 'jpeg';
    cb(null, `${Date.now()}-${name}.${ext}`);
  }
});
const fileFilter = (req, { mimetype }, cb) =>
  cb(null, Boolean(allowTypes.indexOf(mimetype) > -1));
const uploader = multer({ storage, fileFilter, limits: uploadConfig });

app.post('/upload', uploader.array('images'), async ({ files }, res) => {
  const dbInstance = await db;

  const insertQueue = [];
  const images = [];
  _.each(files, ({ filename, path: imagePath, size }) => {
    // Insert image information to db
    insertQueue.push(
      dbInstance
        .get('resource')
        .push({
          id: uuidv4(),
          name: filename,
          path: imagePath,
          size
        })
        .write()
    );
    // Prepare data to return to client
    images.push({
      name: filename
    });
  });
  await Promise.all(insertQueue);

  res.json({ images });
});

// Serve image
app.get('/image/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const imgPath = path.resolve(__dirname, process.env.FOLDER_RESOURCE, id);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Image #${id} is not exist.`);
    }

    const imageStream = sharp(imgPath);
    return imageStream.pipe(res);
  } catch (err) {
    return next(err);
  }
});
// Error handler
app.use((err, req, res, next) => {
  const message =
    process.env.NODE_ENV !== 'production'
      ? err.message
      : 'An error encountered while processing images';
  res.status(500).json({ message });

  return next();
});

const port = process.env.PORT || 9999;
app.listen(port);
