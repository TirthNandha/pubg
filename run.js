const EventEmitter = require('events');
const  WebSocket  =  require('ws');
const  util = require('util');
const  _ = require("underscore");
const  e = new EventEmitter;   //no extends because it's works pretty strange with es6 classes

const fs = require('fs');


var HttpStatus = require('http-status-codes');

var express = require('express');
var bodyParser = require('body-parser')
var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

/*

WARNING: READ GNU General Public License v3 (GPL-3)  

Deps: npm install ws underscore express body-parser

How to get ticket (aka access token aka password?):
1) Run wireshark, filter by: tcp.port == 81 && http
2) Run game and wait for loading menu (lobby)
3) Looking for something like "/userproxy?provider=steam&.." in wireshark and open it (by left click)
4) Copy Value from middle frame, it's must be more 450 symbols (468 for me)
You can found full lenght ticket in "Request URI Query Parameter",press right mouse -> copy -> value and remove "ticket="

Ticket will dead after few minutes in offline (sure, maybe ip change need to regenerate token). OR it maybe works while you in game.
You need start game again and get ticket again.
You can be connected with out any problems for few hours and do fast restarts if u need this. 
Not possible to play while connected from this script (not sure about real play, but you will be kicked from lobby by double connection)

More methods here: https://gist.github.com/Hormold/92fbb9733eb9c9f0fef9adf0e0750bc7
If you will found how to generate token from engine - it'll be cool!
Look at the menu(lobby) source code here: http://front.battlegroundsgame.com/app/2017.04.06-4/app.js
Get more info about game protocol using Wireshark and filter: (websocket)
*/

const settings = require("./settings.js")


function handlerResponse(res, isSuccess, result) {
        if (!isSuccess) {
            if (result === "NullReferenceException") {
                return res.send({
                    code: HttpStatus.BAD_REQUEST,
                    result: result
                })
            } else {
                return res.send({
                    code: HttpStatus.SERVICE_UNAVAILABLE,
                    result: result
                })
            }

        }

        if (result.length === 0) {
            return res.send({
                code: HttpStatus.NOT_FOUND
            });
        }

        return res.send({
            code: HttpStatus.OK,
            result: result
        });
}


class service {  
    constructor(settings) {
        this.settings = settings;
        let server = 'entry.playbattlegrounds.com:81'; //Use /health to check server health  
        let query = { 'provider': 'steam', 'ticket': settings.ticket, 'playerNetId': settings.steamId, 'cc': 'RU', 'clientGameVersion': settings.v };    
        let finalQuery = 'http://' + server + '/userproxy?' + this.encodeQueryData(query);    
        this.ws  =  new  WebSocket(finalQuery);    
        this.counter = 1000000; //Counter to track callbacks from WS server
        this.cbs = {};

        this.ws.on("message", data => {
            try {
                var j = JSON.parse(data);
            } catch (ex) {
                console.log("ERROR DECODING MSG", ex, data);
                var j = [];
            }
            if (j[0] === 0) {
                //Recived initial pkg?
                e.emit("init", j[4], j[5])
                return;
            }
            if (!j[0]) return console.log("Invalidate pkg", data);
            var pkgId = j[0];
            var emitter = j[2];
            var newData = _.clone(j).slice(2)
            if (_.has(this.cbs, pkgId)) {
                this.cbs[pkgId](...newData);
            } else {
                console.log(`Unhandled pkg from ${emitter}`, newData)
            }
            // if (this.settings.debug) console.log("INCOME", j);
            e.emit("msg", data);    
        });

        this.ws.on('open', function(data,  flags)  {
            // Need a little time to switch protocols and etc..
            setTimeout(function() {
                e.emit("connected")    
            }, 1000);
        });    
        this.ws.on('error',  function  incoming(data,  flags)  {
            e.emit("error", data);    
        });     
        this.ws.on('close',  function  incoming(code, data)  {
            e.emit("error", data);    
        });      //Send ping every 30 sec
            
        setInterval(() => {
            this.sendMessage("Ping");    
        }, 30000); //30 sec. taken from lobby script

        setInterval(() => {
            this.cbs = {};
        }, 60000);  //remove all old callbacks to clean memory
    }  
    sendMessage() {
        let arg = [...arguments];
        let newAr = [];
        let cb;
        _.each(arg, ar => {
            if (typeof ar !== "function") newAr.push(ar);
            else cb = ar;
        });
        this.counter++;
        let ourId = _.clone(this.counter);
        if (typeof cb == "function") this.cbs[ourId * -1] = cb;        
        var args = [ourId, null, "UserProxyApi", ...newAr];
        this.ws.send(JSON.stringify(args));
        // if (this.settings.debug) console.log("Sending", args);      
    }    
    encodeQueryData(data) {    
        let ret = [];    
        for (let d in data) ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));    
        return ret.join('&');  
    }  
};

util.inherits(service, EventEmitter);


/*
    get user profile
 */
app.get('/GetBroUserStatesByAccountId/:accountId', function(req, res) {
    var accountId = req.params.accountId;
    s.sendMessage("GetBroUserStatesByAccountId", [accountId], function(isSuccess, result) {
        return handlerResponse(res, isSuccess, result);
    });
});

app.get('/GetBroUserStatesByNickname/:nickname', function(req, res) {
    var nickname = req.params.nickname;
    s.sendMessage("GetBroUserStatesByNickname", [nickname], function(isSuccess, result) {
        return handlerResponse(res, isSuccess, result);
    });
});

app.get('/GetBroUserStatesBySteamId/:steam64id', function(req, res) {
    var steam64Id = req.params.steam64id;
    s.sendMessage("GetBroUserStatesBySteamId", [steam64Id], function(isSuccess, result) {
        return handlerResponse(res, isSuccess, result);
    });
});


/*
    get user stats by nickname/accountId
 */
app.get("/GetUserRecordByNickname", function(req, res) {
    var nickname = req.query.nickname;
    var rankType = req.query.rankType || "solo";
    var region = req.query.region || "as";

    s.sendMessage("GetBroUserStatesByNickname", [nickname], function(isSuccess, result) {
        if (isSuccess) {
            if (result.length === 0) {
                return res.send({
                    code: HttpStatus.NOT_FOUND
                })
            } else {
                var infoPlayer = result[0];

                if (!infoPlayer.AccountId) {
                    return res.send({
                        code: HttpStatus.INTERNAL_SERVER_ERROR
                    })
                }

                s.sendMessage("GetUserRecord", infoPlayer.AccountId, region, rankType, function(_isSuccess, _result) {
                    if (!_isSuccess) {
                        return res.send({
                            code: HttpStatus.SERVICE_UNAVAILABLE,
                            result: _result
                        })
                    }

                    var resp = {
                        code: HttpStatus.OK,
                        result: {
                            infoPlayer: infoPlayer,
                            stats: _result
                        }
                    };

                    // if (settings.debug) {
                    //     var saveTo = util.format("/tmp/GetBroUserStatesByNickname.%s.%s.%s.json", nickname, region, rankType);
                    //     fs.writeFile(saveTo, JSON.stringify(resp), function (err) {
                    //         if (err) {
                    //             return console.trace(err);
                    //         }

                    //         console.log(util.format("SAVE %s", saveTo));
                    //     });
                    // }

                    return res.send(resp);
                });
            }
        } else {
            return handlerResponse(res, isSuccess, result);
        }
    });
});

app.get("/GetUserRecord", function(req, res) {
    /*
    `type` available values: Rating WinPoints KillPoints
     `mode` available values: solo duo squad
    `server` available values: as eu na oc se?a
    */
    var accountId = req.query.accountId;
    var rankType = req.query.rankType || "solo";
    var region = req.query.region || "eu";
    s.sendMessage("GetUserRecord", accountId, region, rankType, function(isSuccess, result) {

        // if (settings.debug) {
        //     var resp = {
        //         code: HttpStatus.OK,
        //         result: result
        //     };

        //     var saveTo = util.format("/tmp/GetUserRecord.%s.%s.%s.json", accountId, region, rankType);
        //     fs.writeFile(saveTo, JSON.stringify(resp), function (err) {
        //         if (err) {
        //             return console.trace(err);
        //         }

        //         console.log(util.format("SAVE %s", saveTo));
        //     });
        // }

        return handlerResponse(res, isSuccess, result);
    });
});


/*
    get records of leader board
 */
app.get("/GetBroLeaderboard", function(req, res) {
    /*
    `type` available values: Rating WinPoints KillPoints
     `rankType` available values: solo duo squad
    `region` available values: as eu na oc sea
    */
    var type = req.query.type || "Rating";
    var rankType = req.query.rankType || "solo";
    var region = req.query.region || "eu";

    //Using fake accountId to get leaderbord + user stats to hide our token
    var accountId = req.query.accountId || "account.59e4ce452ac94e27b02a37ac7a301135";

    s.sendMessage("GetBroLeaderboard", region, rankType, type, accountId, function(isSuccess, result) {
        return handlerResponse(res, isSuccess, result);
    });
});




var s = new service(settings);
e.on("connected", () => {
    app.listen(settings.port, settings.addr, function() {
        console.log(`App listening on port ${settings.port}!`);
    });
    s.sendMessage("Ping");
});

e.on("error", (data) => {
    /*
        data:
            "dup": another device sign in and kick you off
     */
    console.log("Error connecting:", data);
})

e.on("init", (data, args) => {
    if (settings.debug) {
        if (typeof data === "string") {
            console.log("init", data);
        }
    }
})
