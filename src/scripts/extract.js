const fs = require("fs");

const readme = fs.readFileSync("../../README.md", "utf-8");

function slugify(name) {
	return name.toLowerCase().replace(/[^a-z\d]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

for (line of readme.split("\n")) {
	if (line.startsWith("#")) {
		console.log(slugify(line));
	}
}