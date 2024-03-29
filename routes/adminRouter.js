const express = require("express");
const debugLog = require("debug")("app:rootRouter");
const asyncHandler = require("express-async-handler");

const router = express.Router();

const app = require("../app/app.js");

const appUtils = require("../app/app-utils");
const utils = appUtils.utils;


router.get("*", asyncHandler(async (req, res, next) => {
	var loginNeeded = false;

	if (req.session.username == null) {
		loginNeeded = true;

	} else if (!req.session.user.roles.includes("admin")) {
		loginNeeded = true;
	}

	if (loginNeeded) {
		req.session.userMessage = "Login required.";

		res.redirect("/");

	} else {
		next();
	}
}));

router.get("/", asyncHandler(async (req, res, next) => {
	res.render("admin/home");
}));

router.get("/users", asyncHandler(async (req, res, next) => {
	res.locals.limit = 20;
	res.locals.offset = 0;

	if (req.query.limit) {
		res.locals.limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		res.locals.offset = parseInt(req.query.offset);
	}

	res.locals.userCount = await db.countDocuments("users");
	
	var users = await db.findMany("users", {}, {limit:res.locals.limit, skip:res.locals.offset});

	res.locals.users = users;

	res.locals.paginationItemCount = res.locals.userCount;
	res.locals.paginationBaseUrl = "/admin/users";

	res.render("admin/users");
}));

router.get("/user/:username", asyncHandler(async (req, res, next) => {
	var username = req.params.username;
	
	var user = await db.findOne("users", {username:username});

	res.locals.user = user;

	res.render("admin/user");
}));

router.get("/user/:username/add-role/:role", asyncHandler(async (req, res, next) => {
	const username = req.params.username;
	const role = req.params.role;

	const user = await db.findOne("users", {username:username});

	if (!user.roles) {
		user.roles = [];
	}

	user.roles.push(role);

	const updateResult = await db.updateOne("users", {_id:user._id}, {$set: user});

	req.session.userMessage = `Modified '${username}'`;
	req.session.userMessageType = "success";

	res.redirect(`/admin/user/${username}`);
}));

router.get("/user/:username/delete", asyncHandler(async (req, res, next) => {
	var username = req.params.username;

	await db.deleteOne("users", {username:username});

	req.session.userMessage = `Deleted user '${username}'`;
	req.session.userMessageType = "success";

	res.redirect("/admin/users");
}));


router.get("/data-migrations", asyncHandler(async (req, res, next) => {
	res.locals.dataMigrationsCount = await db.countDocuments("dataMigrations");
	
	const dataMigrations = await db.findMany("dataMigrations", {});

	res.locals.dataMigrations = dataMigrations;

	res.render("admin/dataMigrations");
}));


module.exports = router;
