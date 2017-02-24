var restify = require( 'restify' );
var builder = require( 'botbuilder' );
var memeDictionary = require('./memeDict.js');

var Curl = require( 'node-libcurl' ).Curl;

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

var intents = new builder.IntentDialog();

//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', intents);

// type "change name" to change name
intents.matches(/^change name/i, [
    function (session) {
        session.beginDialog('/profile');
    },
    function (session, results) {
        session.send('Ok... Changed your name to %s', session.userData.name);
    }
]);

// verify user data
intents.matches(/^verify/i, [
    function (session) {
        session.beginDialog('/profile');
    }
]);

// image search to hit apis
intents.matches(/^image search/i, [
    function (session) {
        session.beginDialog('/imageSearch');
    }
]);

// meme generator
intents.matches(/^make a meme/i, [
    function (session) {
        session.beginDialog('/memeGen');
    }
]);

// reset profile info to trigger initial greeting
intents.matches(/^reset/i, [
    function (session) {
        session.userData.name = null;
        session.userData.color = null;
        session.beginDialog('/profile');
    }
]);

intents.matches(/^(hello|hi|greetings|what now)/i, [
    function (session, results) {
        if(!session.userData.name) {
            session.beginDialog('/profile');
        }else {
            session.send("Hello " + session.userData.name + " try issuing a command like make a meme, or image search ");
        }
        
    }
]);


intents.onDefault([
    function (session, args, next) {
        if (!session.userData.name || !session.userData.color) {
            session.beginDialog('/profile');
        } else {
            next();
        }
    }
]);

// pass an array of functions in order to create waterfall
bot.dialog('/profile', [
    function (session, args, next) {
        if (!session.userData.name) {
            builder.Prompts.text(session, 'Hi! What is your name?');
        } else {
            next();
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.userData.name = results.response;
        }
        if (!session.userData.color) {
            builder.Prompts.text(session, "What is your favorite color?");
        } else {
            next();
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.userData.color = results.response;
            next();
        } else {
            next()
        }
    },
    function (session) {
        session.beginDialog('/checkUserInfo');
    }
]);

bot.dialog('/checkUserInfo', [
    function (session) {
        builder.Prompts.text(session, "Your name is " + session.userData.name + " and your favorite color is " + session.userData.color + ", is this correct?");
    },
    function (session, results, next) {
        if (results.response === "yes") {
            session.send("Fantastic!");
            session.endDialog();
        } else if (results.response === "no") {
            session.send("let's try again");
            session.userData.name = null;
            session.userData.color = null;
            session.beginDialog('/profile');
        } else {
            session.send("I didn't understand that, please submit yes or no");
            session.endDialog();
            beginDialog('/checkUserInfo');
        }
    }
])

bot.dialog('/imageSearch', [
    function (session) {
        builder.Prompts.text(session, "Type in some words to search for a related image and a quantity");
    },
    function (session, results, next) {
        if (results.response == "quit") {
            session.endDialog("maybe next time");
        } else {
            var imgQuantity;
            if (results.response.replace(/\D/g,'') == '') {
                imgQuantity = 5;
            } else {
                imgQuantity = results.response.replace(/\D/g,'');
                console.log(imgQuantity)
                if (imgQuantity > 20) {
                    imgQuantity = 20;
                } else if (imgQuantity <= 0) {
                    imgQuantity = 5;
                }
            }
            
            var searchCriteria = results.response.replace(/[0-9]/g,'');

            if ( searchCriteria[0] == ' ') { searchCriteria.substring(1) }
            if ( searchCriteria[searchCriteria.length-1] == ' ') { searchCriteria.substring(0, searchCriteria.length-1) }

            // build api url
            var apiURL = "https://pixabay.com/api/?key=4647690-a6551a2e46edc0c52a205a8b3&q=" + searchCriteria.replace(" ", "+") + "&image_type=photo"

            console.log(apiURL);

            var curl = new Curl();
            curl.setOpt( 'URL', apiURL );
            curl.on( 'end', createCarousel);

            function createCarousel( statusCode, body, headers ) {
                var imgApiResponse = JSON.parse(body);
                var apiReturnQty = imgApiResponse.totalHits;
                var myCards = [];

                // Maximum number of images returned does not exceed API call qty
                if(imgQuantity > apiReturnQty) { imgQuantity = apiReturnQty }

                // push cards into array
                for (var i = 0; i < imgQuantity; i++) {
                    myCards.push(
                        new builder.HeroCard(session)
                            .images([
                                builder.CardImage.create(session, imgApiResponse.hits[i].webformatURL)
                                ])
                            .buttons([
                                builder.CardAction.openUrl(session, imgApiResponse.hits[i].webformatURL, "open image url")
                                ])
                    )
                }

                if (apiReturnQty > 0) {
                    // build the carousel
                    var carouselReply = new builder.Message(session)
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(myCards)

                    // send the carousel
                    session.send(carouselReply)
                } else {
                    session.send("No results found for " + searchCriteria.replace("+", " "));
                }
                
                this.close();
            };
            
            curl.on( 'error', curl.close.bind( curl ) );
            curl.perform();
            
            //session.send(results.response);
            session.endDialog();
            }
        }
])


bot.dialog('/memeGen', [
    function (session) {
        builder.Prompts.choice(session, "Choose a photo", memeDictionary);
    },
    function (session, results, next) {
            session.userData.background = memeDictionary[results.response.entity];
            builder.Prompts.text(session, 'enter upper text');
    },
    function (session, results, next) {
        if (results.response == "quit") {
            session.endDialog("maybe next time");
        } else {
            session.userData.upperText = results.response;
            builder.Prompts.text(session, "enter lower text");
        }
    },
    function (session, results, next) {
        if (results.response == "quit") {
            session.endDialog("maybe next time");
        } else {
            session.userData.lowerText = results.response;
            next();
        }
        
    },
    function (session, results) {

        var splitURL = session.userData.background.split("/");
        var bgPhoto = splitURL[splitURL.length-1];
        var upperText = session.userData.upperText.replace("?", "~q").replace("%", "~p").replace("#", "~h").replace("/", "~s").replace(" ", "-");
        var lowerText = session.userData.lowerText.replace("?", "~q").replace("%", "~p").replace("#", "~h").replace("/", "~s").replace(" ", "-");

        var apiURL = "https://memegen.link/" + bgPhoto + "/" + upperText + "/" + lowerText + ".jpg";
        console.log(apiURL)
        var msg = new builder.Message(session)
                    .addAttachment({
                        contentUrl: apiURL,
                        contentType: "image/jpg"
                    });
        
        session.send(msg)

        session.userData.background = {};
        session.userData.upperText = {};
        session.userData.lowerText = {};

        session.endDialog();
    }
])

