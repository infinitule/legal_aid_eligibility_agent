// Build step: compile src_app.jsx -> vendor/app.js (classic React runtime, no bundler).
// Run after editing src_app.jsx:   node build.js
// Then reload http://localhost:8000/T-2142-24_Workspace_2.html
const fs = require("fs");
const path = require("path");

global.navigator = { userAgent: "node" };
const Babel = require(path.join(__dirname, "vendor", "babel.standalone.min.js"));

const src = fs.readFileSync(path.join(__dirname, "src_app.jsx"), "utf8");
const out = Babel.transform(src, { presets: [["react", { runtime: "classic" }]] }).code;
fs.writeFileSync(path.join(__dirname, "vendor", "app.js"), out);
console.log("Built vendor/app.js (" + out.length + " chars) from src_app.jsx");
