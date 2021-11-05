const fs = require("fs");

const readme = fs.readFileSync("../../README.md", "utf-8");

function slugify(name) {
	return name.toLowerCase()
		.replace(/\(.*\)/, "")
		.replace(/ - .+/, "")
		.replace(/[^a-z\d]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
}

let path = [];

let sectionData = {};

const regexSimple = /^- \[([^\[\]]+)\]\((https?[^\(\)]+)\)$/;
const regexTag = /^- \[([^\[\]]+)\]\((https?[^\(\)]+)\) \(([^\(\)]+)\)$/;
let validCount = 0;
let invalidCount = 0;

for (line of readme.split("\n")) {
	line = line.replace("\r", "").trim();

	let count = -1;
	for (c of line) {
		if (c != '#') break;
		count++;
	}
	if (count > 0) {
		while (count <= path.length) path.pop();

		path.push(slugify(line));

		sectionData[path.join("/")] = {
			"name": line.replace(/^#+/, "").trim(),
			"mods": []
		};
	} else {
		if (line.length > 0) {
			let matches = regexSimple.exec(line);
			if (matches != null) {
				sectionData[path.join("/")].mods.push({
					"name": matches[1],
					"url": matches[2] // TODO: URL matching, attempt to find other sources
				});
				validCount++;
			} else {
				let matches = regexTag.exec(line);
				if (matches != null) {
					sectionData[path.join("/")].mods.push({
						"name": matches[1],
						"url": matches[2],
						"tag": matches[3] // TODO: don't just pass this through
					});
					validCount++;
				} else {
					console.log(line);
					invalidCount++;
				}
			}
		}
	}
}

//console.dir(sectionData, { depth: null });
console.log(validCount);
console.log(invalidCount);