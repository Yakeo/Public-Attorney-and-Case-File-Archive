const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/', clientController.createClient);
router.get('/', clientController.listClients);
router.get('/:id', clientController.getClient);
router.patch('/:id', clientController.updateClient);

// Client <-> Case links
router.post('/:id/cases', clientController.linkClientToCase);
router.get('/:id/cases', clientController.listClientCases);

module.exports = router;
