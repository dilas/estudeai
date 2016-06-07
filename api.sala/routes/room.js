var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var redis = require("redis");
var store = redis.createClient();

// Checks if the specified room exists
var checksIfRoomExists = function(req, res, roomId, cb) {
    store.exists(roomId, function(err, reply) {
        if (reply) {
            cb();
        } else {
            res.status(500).json({ error: "Room doesn't exists!" });
        }
    });
};

// Creates a new room
var createRoomHandler = function(req, res, next) {
    var roomId = req.body.room_id;
    var room = {
        id: roomId,
        teacher: null,
        students: []
    };

    store.exists(roomId, function(err, reply) {
        if (reply) {
            res.status(500).json({ error: "Room already exists!" });
        } else {
            store.set(roomId, JSON.stringify(room));
            res.json({ room_url: req.protocol + '://' + req.get('host') + "/rooms/" + roomId});
        }
    });
};

// Generic handler to grab room_id parameter
var roomIdParamHandler = function (req, res, next, roomId) {
    console.log('Room ID: ' + roomId);

    checksIfRoomExists(req, res, roomId, function() {
        req.roomId = roomId;
        next();
    });
};

// Enter room handler
var enterRoomHandler = function (req, res, next) {
    
};

// List students handler
var listStudentsHandler = function (req, res, next) {
    store.get(req.roomId, function (err, reply) {
        var room = JSON.parse(reply);
        res.json(room.students);
    });
};

// Destroy the specified room
var destroyRoomHandler = function (req, res, next) {
    store.del(req.roomId);
    res.end();
};

// Teacher joins the room handler
var teacherJoinsHandler = function (req, res, next) {
    store.get(req.roomId, function (err, reply) {
        var room = JSON.parse(reply);
        room.teacher = req.body;
        store.set(req.roomId, JSON.stringify(room));
        res.end();
    });
};

// Teacher leaves the room handler
var teacherLeavesHandler = function (req, res, next) {
    store.get(req.roomId, function (err, reply) {
        var room = JSON.parse(reply);
        room.teacher = null;
        store.set(req.roomId, JSON.stringify(room));
        res.end();
    });
};

// Checks if student exists in the room
var studentExists = function (room, studentId) {
    var students = room.students.filter(function (student) { return student.id === studentId; });
    return students && students.length > 0;
};

// Remove a specific student from the room
var studentRemove = function (room, studentId) {
    return room.students.filter(function (student) { return student.id !== studentId; });
};

// Student joins the room handler
var studentJoinsHandler = function (req, res, next) {
    store.get(req.roomId, function (err, reply) {
        var room = JSON.parse(reply);
        if (!studentExists(room, req.body.id)) {
            room.students.push(req.body);
            store.set(req.roomId, JSON.stringify(room));
        }
        res.end();
    });
};

// Student leaves the room handler
var studentLeavesHandler = function (req, res, next) {
    store.get(req.roomId, function (err, reply) {
        var room = JSON.parse(reply);
        room.students = studentRemove(room, req.body.id);
        store.set(req.roomId, JSON.stringify(room));
        res.end();
    });
};

// Setup the routes
router.post('/create', bodyParser.json(), createRoomHandler);
router.param('room_id', roomIdParamHandler);
router.get('/:room_id', enterRoomHandler);
router.get('/:room_id/students', listStudentsHandler);
router.post('/:room_id/destroy', destroyRoomHandler);
router.post('/:room_id/teacher/join', teacherJoinsHandler);
router.post('/:room_id/teacher/leave', teacherLeavesHandler);
router.post('/:room_id/student/join', studentJoinsHandler);
router.post('/:room_id/student/leave', studentLeavesHandler);

module.exports = router;