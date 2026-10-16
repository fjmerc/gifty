const asyncHandler = require('express-async-handler');
const Vendor = require('../models/Vendor');
const { findOwned } = require('../utils/ownership');

// @desc Add a new vendor partnership
// @route POST /api/vendors
// @access Private
exports.addVendorPartnership = asyncHandler(async (req, res) => {
    const { vendorName, vendorDetails } = req.body;

    if (!vendorName || !vendorDetails) {
        res.status(400);
        throw new Error('Vendor name and details are required');
    }

    // Create the vendor
    const vendor = await Vendor.create({
        vendorName,
        vendorDetails,
        user: req.user._id
    });

    res.status(201).json(vendor);
});

// @desc Get the caller's vendor partnerships (legacy un-owned ones are
// given to the instance owner at upgrade: services/legacyOwnership.js)
// @route GET /api/vendors
// @access Private
exports.getVendors = asyncHandler(async (req, res) => {
    const vendors = await Vendor.find({ user: req.user._id });
    res.json(vendors);
});

// @desc Update a vendor partnership
// @route PUT /api/vendors/:vendorId
// @access Private
exports.updateVendorPartnership = asyncHandler(async (req, res) => {
    const { vendorId } = req.params;
    const { vendorName, vendorDetails } = req.body;

    // Only the owner may modify; others (and legacy un-owned vendors) get 404
    const vendor = await findOwned(Vendor, vendorId, req.user._id, { label: 'Vendor' });

    vendor.vendorName = vendorName || vendor.vendorName;
    vendor.vendorDetails = vendorDetails || vendor.vendorDetails;

    const updatedVendor = await vendor.save();
    res.json(updatedVendor);
});

// @desc Delete a vendor partnership
// @route DELETE /api/vendors/:vendorId
// @access Private
exports.deleteVendorPartnership = asyncHandler(async (req, res) => {
    const { vendorId } = req.params;

    // Only the owner may modify; others (and legacy un-owned vendors) get 404
    const vendor = await findOwned(Vendor, vendorId, req.user._id, { label: 'Vendor' });

    await vendor.deleteOne();
    res.status(204).json(); // No content to send back
});
