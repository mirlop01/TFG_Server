const moment = require("moment");
const mongoose = require("mongoose");

const MealDiaryModel = require("../models/Meals/meal-diary");

const UserModel = require("../models/User/user");
const GlucoseModel = require("../models/Glucose/glucose");
const GlucoseDiaryModel = require("../models/Glucose/glucose-diary");

const InsulinDiaryModel = require("../models/Insulin/insulin-diary");
const InsulinTypeModel = require("../models/Insulin/insulin-types");

const RequiredActionModel = require("../models/User/required-actions");
const ActionResponseModel = require("../models/User/action-response");

const ACTION_TYPES = {
	HIPOGLUCEMIA: 1,
	GLUCOSA_AYUNAS_BIEN: 2,
	INSULINA: 3,
	GLUCOSA_AYUNAS_REGULAR: 4,
	GLUCOSA_AYUNAS_MAL: 5,
};

exports.getMealsByDate = function (req, res) {
	var user = req.headers.user;
	var { date } = req.body;

	MealDiaryModel.find({
		user: mongoose.Types.ObjectId(user),

		createdAt: {
			$gte: moment(date).startOf("day"),
			$lt: moment(date).endOf("day"),
		},
	})
		.populate({
			path: "mealList",
			populate: {
				path: "foodItem",
			},
		})
		.then((mealList) => {
			res.send(mealList);
		})
		.catch((err) => {
			res.status(500).send({
				ok: false,
				message:
					"No se ha podido obtener los datos del diario de comidas del día " +
					moment(date).format("DD-MM-YYYY"),
			});
		});
};

exports.getInsulinDiaryByDate = (req, res) => {
	var user = req.headers.user;
	var { date } = req.body;

	InsulinDiaryModel.find({
		user: mongoose.Types.ObjectId(user),

		createdAt: {
			$gte: moment(date).startOf("day"),
			$lt: moment(date).endOf("day"),
		},
	})
		.populate("type")
		.then((insulinList) => {
			res.send(insulinList);
		})
		.catch((err) => {
			res.status(500).send({
				ok: false,
				message:
					"No se ha podido obtener los datos del diario de insulina del día " +
					moment(date).format("DD-MM-YYYY"),
			});
		});
};

exports.getGlucoseDiaryByDate = (req, res) => {
	var user = req.headers.user;
	var { date } = req.body;

	GlucoseDiaryModel.findOne({
		user: mongoose.Types.ObjectId(user),

		createdAt: {
			$gte: moment(date).startOf("day"),
			$lt: moment(date).endOf("day"),
		},
	})
		.populate("glucoseList")
		.then((glucoseDiary) => {
			res.send(glucoseDiary ? glucoseDiary.glucoseList : null);
		})
		.catch((err) => {
			res.status(500).send({
				ok: false,
				message:
					"No se ha podido obtener los datos del diario de insulina del día " +
					moment(date).format("DD-MM-YYYY"),
			});
		});
};

exports.saveGlucose = (req, res) => {
	let user = req.headers.user;
	let { glucose, comments } = req.body;
	let date = new Date();

	var newModel = new GlucoseModel({
		glucose: glucose,
		comments: comments,
	});

	newModel.save();

	GlucoseDiaryModel.findOneAndUpdate(
		{
			user: mongoose.Types.ObjectId(user),

			createdAt: {
				$gte: moment(date).startOf("day"),
				$lt: moment(date).endOf("day"),
			},
		},
		{
			$push: { glucoseList: newModel._id },
		},
		{
			new: true,
			upsert: true,
			rawResult: true,
		}
	)
		.then((result) => {
			if (glucose < 70 || result.lastErrorObject.updatedExisting) {
				var type;

				if (glucose < 70) type = ACTION_TYPES.HIPOGLUCEMIA;
				else if (glucose > 70 && glucose < 109)
					type = ACTION_TYPES.GLUCOSA_AYUNAS_BIEN;
				else if (glucose > 110 && glucose < 130)
					type = ACTION_TYPES.GLUCOSA_AYUNAS_REGULAR;
				else type = ACTION_TYPES.GLUCOSA_AYUNAS_MAL;

				this.manageRequiredActions(type, user, res, false);
			} else {
				res.send(
					new ActionResponseModel({
						message: "¡Guardado con éxito!",
						prize: 1,
						name: "Registro de glucosa",
					})
				);
			}
		})
		.catch((err) => {
			res.status(500).send({
				ok: false,
				message: err,
			});
		});
};

exports.getInsulinTypes = (req, res) => {
	InsulinTypeModel.find({}, (insulinErr, insulinRes) => {
		if (insulinErr) res.status(500).send(insulinErr);

		res.send(insulinRes);
	});
};

exports.saveInsulin = (req, res) => {
	var user = mongoose.Types.ObjectId(req.headers.user);
	var { type, quantity } = req.body;

	var newEntry = new InsulinDiaryModel({
		type: type,
		user: user,
		quantity: quantity,
	});

	try {
		newEntry.save();
		this.manageRequiredActions(ACTION_TYPES.INSULINA, user, res);
	} catch (err) {
		res.status(500).send(err);
	}
};

/**************** PRIVATE FUNCTIONS ****************/
exports.manageRequiredActions = (actionType, user, res, fulfilled) => {
	let userId = mongoose.Types.ObjectId(user);

	ActionResponseModel.findOne({ type: actionType }).then((actionRes) => {
		let newAction;

		if (!actionRes || !actionRes.isAction) {
			actionRes = new ActionResponseModel({
				message: actionRes.message,
			});
		} else {
			RequiredActionModel.findOneAndUpdate(
				{
					user: userId,
					fulfilled: false,
				},

				{ fulfilled: true }
			)
				.then((previousActionResponse) => {
					if (!fulfilled) {
						newAction = new RequiredActionModel({
							type: actionRes._id,
							user: userId,
							fulfilled: fulfilled,
							status: actionRes.status,
						});

						newAction.save();
					} else {
						if (actionRes.nextAction) {
							ActionResponseModel.findOne({
								type: actionRes.nextAction,
							}).then((nextActionResponse) => {
								newAction = new RequiredActionModel({
									type: nextActionResponse._id,
									user: userId,
									fulfilled: false,
									status: nextActionResponse.status,
								});

								newAction.save();
								res.send();
							});
						}
					}
				})
				.catch((err) => {
					res.status(500).send(
						"Error al guardar accióin pendiente: " + err
					);
				});

			UserModel.findOne({ _id: userId }).then((userResponse) => {
				userResponse.coins += actionRes.prize;

				if (userResponse.currentAction !== newAction)
					userResponse.currentAction = newAction;

				userResponse.save();
			});
		}

		res.send(actionRes);
	});
};
