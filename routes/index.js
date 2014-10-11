var express = require('express');
var router = express.Router();


//function restrict(req, res, next) {
//    if (req.session.user) {
//        next();
//    } else {
//        next (new Error('Access denied - not logged in!'));
//    }
//}

var users = [
    {
//        'wishes': [],
        'name': "Me",
        'id': "12"
    },
    {
//        'wishes': [
//            {'id': 1, 'content': 'Text here pls.', 'state': false},
//            {'id': 2, 'content': "KTHXBYE", 'state': true}
//        ],
        'name': "Friend 1",
        'id': "123"
    },
    {
//        'wishes': [
//            {'id': 3, 'content': "TEST1", 'state': true},
//            {'id': 4, 'content': "Test2", 'state': false},
//            {'id': 5, 'content': "Test3", 'state': false}
//        ],
        'name': "Friend 2",
        'id': "1234"
    }
];

//router.get('/logout', function(req, res){
//    // destroy the user's session to log them out
//    // will be re-created next request
//    req.session = null;
//    res.send("Logged out");
//});

router.post('/register', function(req, res, next) {
    var db = req.db;
    var fbUserId = req.body.fbId;
    var userToken = req.body.token;
    var usersCollection = db.get('users');

    var fb = req.fb;
    fb.setAccessToken(userToken);



    fb.api(fbUserId, function (facebookUser) {
        if(!facebookUser || facebookUser.error) {
            console.log(!facebookUser ? 'error occurred' : facebookUser.error);
            return;
        }

        console.log("Found USER:");
        console.log(JSON.stringify(facebookUser, null, 2))

        //check if user is already registered
        usersCollection.findOne({fbId: fbUserId}, {}, function(err, user) {
            if (!err && !user) {
                //  User is not in the db. Insert the user.
                usersCollection.insert({
                    "fbId": facebookUser.id,
                    "name": facebookUser.name,
                    "token": userToken
                }, function (err, registeredUser) {
                    if (err) {
                        return next(new Error("There was a problem adding the information to the database", err));
                    } else {
                        res.send("OK");

                        usersCollection.find({}, function(err, allRegisteredUsers) {
                            for(var i = 0; i < allRegisteredUsers.length; ++i) {
                                if(allRegisteredUsers[i].fbId != fbUserId) {
                                    console.log("Registered User: " + allRegisteredUsers[i].name);
                                    var currentRegisteredUserId = allRegisteredUsers[i].fbId;
                                    fb.api(fbUserId + "/friends/" + allRegisteredUsers[i].fbId, function(friend) {
                                        if(!friend || friend.error || friend.type == 'OAuthException') {
                                            console.log(!friend ? 'error occurred' : friend.error);
                                            return;
                                        }

                                        console.log(JSON.stringify(friend, null, 2))
                                        console.log("Length: " + friend.data.length);

                                        if(friend.data.length > 0) {
                                            if(friend.data[0].id == currentRegisteredUserId) {
                                                //they are friends
                                                //update both friends lists
                                                usersCollection.update({fbId: currentRegisteredUserId}, {"$push": {"friends": [fbUserId]}}, function (err, document) {
                                                    if (err) {
                                                        return next(new Error("Could not add user [" + fbUserId + "] as friend of user [" + currentRegisteredUserId + "]", err));
                                                    } else {
                                                        usersCollection.update({fbId: fbUserId}, {"$push": {"friends": [currentRegisteredUserId]}}, function(err, document) {
                                                            if(err) {
                                                                return next(new Error("Could not add user [" + currentRegisteredUserId+ "] as friend of user [" + fbUserId + "]", err));
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        } else {
                                            console.log("Users [" + fbUserId + "] and [" + currentRegisteredUserId + "] are not friends!");
                                        }

                                    })
                                }

                             }
                        })
                    }
                }); // end user-found
            } else if (user) {
                next(new Error("User is already registered."));
            } else if (err) {
                next(new Error("Couldn't verify if user was already registered", err));
            } else
                next();
        });


    });


});

//router.post('/login', function(req, res, next){
//    var db = req.db;
//    var fbUserId = req.body.fbId;
//    var userToken = req.body.token;
//    var users = db.get('users');
//
//    if (!fbUserId) {
//        return next(new Error("Please provide fbId"));
//    }
//    console.log('fbUserId passed is: ' + fbUserId);
//
//    users.findOne({fbId: fbUserId}, function(err, user) {
//        if(err) {
//            return next(new Error("There was a problem logging in the user", err));
//        } else if (user) {
//            console.log('fbId:' + user.fbId);
//            console.log('token:' + user.token);
//
//            req.session.user = user;
//            res.send("OK");
//        } else {
//            return next(new Error("User does not exist"));
//        }
//        next();
//    })
//})

router.get("/getFriends/:fbId", function(req, res) {
    var fbId = req.params.fbId;
    var db = req.db;
    var users = db.get('users');

    users.findOne({"fbId": fbId}, function(err, user) {
       if(err) {
           console.log("Cannot get friends for user: " + fbId);
       } else {
           if(user) {
               res.json(user.friends);
           } else {
               res.send(400, "Could not find the user [" + fbId + "] in the database");
           }

       }
    });
});

router.get("/getFriendWishlist/:friendId", function(req, res) {
    var friendId = req.params.friendId;
    var db = req.db;
    var users = db.get('users');

    users.findOne({"fbId": friendId}, function(err, user) {
        if(err) {
            console.log("Cannot get friend's [" + friendId + "] wishlist");
        } else {
            if(user) {
                res.setHeader('Content-Type', 'application-json');
                res.end(JSON.stringify(user.wishlist));
            } else {
                res.send(400, "Could not find the user [" + fbId + "] in the database");
            }
        }
    });
});

router.post('/addWish', function (req, res) {
    var db = req.db;

    var fbUserId = req.body.fbId;
    var content = req.body.content;

    if (!fbUserId || !content) {
        res.status(500).send('id or wish content not set (got fbId=' + fbUserId + ', content="' + content + '")');
        return;
    }

    var wishes = db.get('wishes');

    // Submit to the DB
    wishes.insert({
        "userId": fbUserId,
        "content" : content,
        "bought" : null
    }, function (err, doc) {
        if (err) {
            // If it failed, return error
            throw new Error("There was a problem adding the information to the database.", err);
        }
        else {
            res.send("OK");
        }
    });
});

router.post("/buyFriendWish/:myid/:wishid", function(req, res) {
    var fbId = req.params.myid;
    var wishId = req.params.wishid;
    var db = req.db;
    var wishes = db.get('wishes');

    wishes.update({"_id": wishId}, {"$set" : {"bought": fbId }}, function(err, document) {
       if(err) {
           console.log("Could not update the buyer of the wish [" + wishId + "]" );
       } else {
           res.send(200, "OK");
       }
    });
});

router.get('/friends/:id/list', function (req, res) {
    var friendId = req.params.id;
    for (var i=0; i < users.length; ++i) {
        if (friendId == users[i].id) {
            res.json(users[i].wishes);
            return;
        }
    }
});

router.post('/friends/:friendId/setState/:wishId/:state', function (req, res) {
    var friendId = req.params.friendId;
    var item = req.params.wishId;
    var state = req.params.state;

    // validate input
    if (state != "true" && state != "false") {
        res.send(400, "Invalid value for parameter state. Use 'true' or 'false'");
        return;
    }

    state = state === 'true'; // convert to boolean
    for (var i=0; i < users.length; ++i) { // find friend
        if (friendId == users[i].id) {
            for (var j=0; j<users[i].wishes.length; ++j) {
                if (item == users[i].wishes[j].id) {
                    users[i].wishes[j].state = state;
                    res.send(200, "OK");
                    return;
                }
            }

            res.send(200, "OK"); // executed only if there's no wish with that id
            return;
        }
    }
});

router.get('/wishes/:fbId/list', function(req, res, next) {
    var db = req.db;
    var fbUserId = req.params.fbId;
    if (!fbUserId) {
        return next(new Error("id not set, please set to user's internal id"));
    }
    var wishes = db.get('wishes');
    wishes.find({ "id": fbUserId }, {}, function(e,data){
        res.json(data);
        next();
    });
});


module.exports = router;
