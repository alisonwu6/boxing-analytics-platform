// URL → controller

const express = require("express");
const sessionsController = require("../controllers/sessions.controller");

const router = express.Router();

router.get("/", sessionsController.getSessions);

module.exports = router;
