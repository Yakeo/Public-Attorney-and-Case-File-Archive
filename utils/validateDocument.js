const fs = require('fs/promises');
const CustomError = require('./customError');

// Check signatures as well as the reported MIME type. Not malware scanning.
module.exports = async function validateDocument(file) {
  if (!file) throw new CustomError('No document file was uploaded.', 400);
  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  const mime = file.mimetype;
  const valid = (mime === 'application/pdf' && header.subarray(0, 5).toString() === '%PDF-') ||
    (mime === 'image/png' && header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (['image/jpeg', 'image/jpg'].includes(mime) && header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (mime === 'image/tiff' && ['49492a00', '4d4d002a'].includes(header.subarray(0, 4).toString('hex')));
  if (!valid) throw new CustomError('File contents do not match an allowed document type.', 400);
};
