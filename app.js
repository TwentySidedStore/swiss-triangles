var express = require('express');
var exphbs  = require('express-handlebars');
var helpers = require('./lib/helpers')

var hbs = exphbs.create({
    helpers: helpers,
    defaultLayout: 'main'
});

var app = express();
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.use(express.static('public'));

app.get('/', function (req, res, next) {
    res.render('swiss');
});

// Listen for incoming requests and serve them.
app.listen(process.env.PORT || 5000);


