const express = require('express');
const {
    addVendorPartnership,
    getVendors,
    updateVendorPartnership,
    deleteVendorPartnership
} = require('../controllers/vendorController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Route to add a new vendor partnership
router.post('/', protect, addVendorPartnership);

// Route to retrieve all vendor partnerships
router.get('/', protect, getVendors);

// Route to update an existing vendor partnership
router.put('/:vendorId', protect, updateVendorPartnership);

// Route to delete a vendor partnership
router.delete('/:vendorId', protect, deleteVendorPartnership);

module.exports = router;
