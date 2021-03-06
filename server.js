require("./config/prod-database");

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const { env } = require("process");

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(bodyParser.json());

app.use(function (req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept"
	);
	next();
});

app.use("/api/", require("./app/routes/index"));

var distDir = __dirname + "/public/client/";
app.use(express.static(distDir));

mongoose.connect(
	process.env.URLDB,
	{
		useNewUrlParser: true,
		useCreateIndex: true,
		useUnifiedTopology: true,
	},
	(err) => {
		if (err) throw err;

		console.log("Base de datos online");
	}
);

app.listen(process.env.PORT, () => {
	console.log("Escuchando en puerto " + env.PORT);
});
