//If starting with pm2 on a public server (to listen on port 80), do something like this:
// $ sudo LOTW_LIVE=1 pm2 site.js

//Use an LOTW_PORT env var to use a different address scheme than localhost:8080 
//or publicsite.com:80;


//Imports«
const spawn = require('child_process').spawn;
const http = require('http');
const https = require('https');
const fs = require('fs');

//»

//Var«

//SSL/HTTPS«

/*Instructions«

I am using Debian 11 in Linode.

Followed the instructions at https://certbot.eff.org/instructions:

Install packages: apache2, snapd

$ sudo apt-get install apache2 snapd

$ sudo snap install core; sudo snap refresh core

Start the default apache2 server (if not already running):
$ sudo systemctl start apache2.service

$ sudo snap install --classic certbot

$ sudo ln -s /snap/bin/certbot /usr/bin/certbot

$ sudo certbot --apache

The paths below were found in the file:

/etc/apache2/sites-available/000-default-le-ssl.conf



To renew the cert:

1) Stop this server.

2) Start apache2:

$ sudo systemctl start apache2.service

3) Renew it:

$ sudo certbot renew

4) Stop apache server: 

$ sudo systemctl stop apache2.service

5) Start this server.

»*/

const SITE_NAME = "lotw.site";
const KEY_PATH =`/etc/letsencrypt/live/${SITE_NAME}/privkey.pem`;
const CERT_PATH =`/etc/letsencrypt/live/${SITE_NAME}/fullchain.pem`;

//»

//Default page«
const BASE_PAGE=`
<html><head>
<title>
LOTW - Main
</title>
<link rel="icon" href="/www/img/favicon.ico">
</head>
<body>
<h2>Linux on the Web (LOTW)</h2>
<img width="256" height="256" src="/www/img/lotw256.png"></img>
<ul>
<li><h3><a href="/desk">The desktop environment</a></h3>
<li><h3><a href="/shell">The shell environment</a></h3>
<li><h3><a href="/www/about.html">About page</a></h3>
<li><h3><a href="https://github.com/linuxontheweb/LOTW">Source code and documentation on Github</a></h3>
</ul>
</body>
</html>
`;
//»

//OS_HTML«
const OS_HTML=`
<html>
<head>
<title>
</title>
<meta name="description" content="This is an operating system that runs inside of most modern web browsers">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<link href="www/css/os.css" rel="stylesheet">
<link rel="icon" href="/www/img/favicon.ico">
</head>
<body style="overscroll-behavior-x: none;">
<div style="z-index:100000000;position:absolute;left:0;top:0;overflow:hidden;">
<table style="font-family:monospace;font-size:18;" id="initlog"></table>
</div>
<script src="root/code/mods/sys/core.js" type="module"></script>
<a name="_"></a>
</body>
</html>
`;
//»

const OKAY_DIRS=["root","www"];
const log = (...args)=>{console.log(...args)}

const BASEPATH = process.env.LOTW_PWD || process.env.PWD;
let stats;

const BINPATH = `${BASEPATH}/root/bin`;
if (!(fs.statSync(`${BINPATH}/dummy.js`))) {
log(`Cannot stat: ${BINPATH}/dummy.js`);
	return;
}

const WWWPATH = `${BASEPATH}/www`;
const APPPATH = `${BASEPATH}/root/code/apps`;


let hostname;
let use_port = process.env.LOTW_PORT;
let port = use_port||8080;
if (process.env.LOTW_LIVE){
	hostname="0.0.0.0";
	port = 443;
}
else{
	hostname="localhost";
	port = use_port||8080;
}

//»

//Util«


const hard_spawn=(name, args, cb, send_json)=>{//«

//	spawn('sh', ['-c', 'unoconv -f pdf --stdout sample.doc | pdftotext -layout -enc UTF-8 - out.txt']);
//let arg_str = args
	let do_unescape = true;

	let com_args = args.join(" ");
	if (do_unescape) com_args = com_args.replace(/\\x27/g,"'").replace(/\\x22/g,'"');
	let com = spawn('sh', ['-c', name+" "+com_args]);
    var str = '';
    com.on('error', function() {
        cb(null);
    }); 
    com.stdout.on('data', function(dat) {
        str += dat.toString();
    });
    com.on('close', function() {
		if (send_json) {
			let arr = str.split("\n");
			if (!arr.length) arr=[" "];
			if (arr.length && arr[arr.length-1]==="")  arr.pop();
			cb(JSON.stringify(arr));
		}
		else cb(str);
    }); 
}//»

const mime_from_path=(path, force_bin)=>{//«
	if (path.match(/\.jpg$/i)) return "image/jpeg"
	else if (path.match(/\.gif$/i)) return "image/gif"
	else if (path.match(/\.png$/i)) return "image/png"
	else if (path.match(/\.webp$/i)) return "image/webp"
	else if (force_bin) return "application/octet-stream";
	else return "text/plain"
}//»
const okay=(res, usemime)=>{//«
	header(res, 200, usemime);
}//»
const okaybin=(res)=>{//«
	header(res, 200, "application/octet-stream");
}//»
const nogo=(res, mess)=>{//«
	header(res, 404);
	if (!mess) mess = "NO";
	res.end(mess+"\n");
}//»
const header=(res, code, mimearg)=>{//«
	let usemime = "text/plain";
	if (mimearg) usemime = mimearg;
	if (code == 200) {
		res.writeHead(200, {'Content-Type': usemime, 'Access-Control-Allow-Origin': "*"});
	}
	else res.writeHead(code, {'Content-Type': usemime, 'Access-Control-Allow-Origin': "*"});
}//»
const readdir=(path, opts={}, pattern)=>{//«

return new Promise(async(Y,N)=>{
let pathext="";
let regexp = null;

if (pattern){
if (pattern.match("\.")){
let arr = pattern.split(".");
let fname = arr.pop();
if (fname) regexp = new RegExp("^" + fname.replace(/\./g,"\\."));
path = `${path}/`+arr.join("/");
}
else regexp = new RegExp("^" + pattern.replace(/\./g,"\\."));
}
//log(regexp);

    let dir = fs.opendirSync(path);
    let ent = await dir.read();
	let arr = [];
    while(ent){
        let name = ent.name;
        if (opts.getDir || opts.getRaw || ent.name.match(/\.js$/)) {
            if (ent.isSymbolicLink()){
                try{
                    ent = fs.statSync(`${path}/${name}`);
                }catch(e){}
            }
            if (ent) {
				if (regexp && !regexp.test(name)) {
        			ent = await dir.read();
					continue;
				}
				if (ent.isFile()) {
					if (!name.match(/^\./)) {
						if (opts.getRaw) arr.push(name);
						else arr.push(name.replace(/\.js$/,""));
					}
				}
				else if (ent.isDirectory()){
					if (opts.getDir) arr.push(name);
				}
			}
        }   
        ent = await dir.read();
    }               
	Y(arr);
    dir.close();
});

};//»

//»
/*

	if (url=="/") {//«
		else {
			okay(res);
			res.end("HI");
		}
	}//»
	else if (url=="/_getdirobj"){//«
		let path = decodeURIComponent(arg_hash.path);
		if (path && !path.match(/\.\./)) {
			if (path == "/") path = LOCAL_PATH;
			else path = LOCAL_PATH + "/" + path;
			let ret = allFilesSync(path);
			okay(res,"application/javascript");
			res.end(JSON.stringify(ret));
		}   
		else nogo(res);
	}//»
	else if (url=="/_getfilehash"){//«
		let path = decodeURIComponent(arg_hash.path);
		let ret;
		try {
			ret = fs.readFileSync(LOCAL_PATH+"/"+path);
		}
		catch(e){
			nogo(res, "Trying to read directory?");
			return;
		}
		let shasum = crypto.createHash('sha1');
		shasum.update(ret);
		let hexsum = shasum.digest('hex');
		okay(res);
		res.end(hexsum);
	}//»
*/
const handle_request=async(req, res, url, args)=>{//«
	"use strict";
	let meth = req.method;
	let body, path, enc, pos;
	let marr;
	if (meth == "GET") {//«
		if (url=="/") {
			if (args.path){//«
				let decpath = decodeURIComponent(args.path);
				let usemime=null;
				marr = decpath.match(/\.([a-z0-9]+)$/);
				if (marr&&marr[1]) usemime = ext_to_mime[marr[1]];
				if (!usemime) usemime = "application/octet-stream";
				let localpath = WWWPATH+decpath;
	//			let localpath = LOCAL_PATH+arg_hash.path;
				let str;
	//			let esc_path = localpath.replace(/[ \x22\x27\x5b\x60#~{<>$|&!;()]/g, "\\$&");
				let esc_path = "'"+localpath.replace(/\x27/g, "\\$&")+"'";
log("Getting: "+localpath);
				let stats = null;
				try {
					stats = fs.statSync(localpath)
				}	
				catch(e){
log(e);
				}
				if (!stats) return nogo(res, decpath+": not found");
				
				if (!stats.isFile()) {
					if (stats.isDirectory()) return nogo(res, decpath+": is a directory");
					return nogo(res, decpath+": is not a regular file");
				}
				let nBytes = stats.size
				if (arg_hash.getsize) {
					okay(res);
					res.end(nBytes+"");
				}
				return;
			}//»
			okay(res, "text/html");return res.end(BASE_PAGE);
		}
		if (url.match(/^\/(desk|shell)$/)) return res.end(OS_HTML);
		if (url.match(/^\/_/)){
			if (url == "/_getbin") res.end(JSON.stringify(await readdir(BINPATH)));
			else if (url == "/_getapp") res.end(JSON.stringify(await readdir(APPPATH, {getDir:true, getRaw:true}, args.path)));
			else if (url=="/_getdir"){//«
				let path = decodeURIComponent(args.path);
//				let recur = args.all;
				let comarg = "-Lp";
				if (args.all) comarg += "R";
				comarg += "gG";
				if (path && !path.match(/\.\./)) {
					if (path == "/") path = WWWPATH;
					else path = WWWPATH + "/" + path;
					hard_spawn("ls", [comarg, '--time-style=+%s' ,path], function(ret) {
						if (ret == null) nogo(res);
						else {
							okay(res);
							res.end(ret);
						}   
					}, true); 
					return;
				}   
				else nogo(res);
			}//»
			else if (url == "/_ip") {
				let rv = await fetch("https://ifconfig.me/ip");
				if (!(rv && rv.ok)) return nogo(res, "Could not get ip address");
				res.end(await rv.text());
			}
			else nogo(res, "Bad command");
			return;
		}
		let parts = url.split("/");
		parts.shift();
		let dir = parts.shift();
		if (!(dir&&OKAY_DIRS.includes(dir))) return nogo(res,"Not found");
		let usemime = "application/octet-stream";
		let str;
		let ext_to_mime = {
			"js": "application/javascript",
			"json": "application/javascript",
			"html": "text/html",
			"txt": "text/plain",
			"synth": "text/plain",
			"sh": "text/plain",
			"gz": "application/gzip",
			"wav": "audio/wav"
		}
		if (marr = url.match(/\.(js|html|json|txt|sh|mf|synth)$/)) {
			usemime = ext_to_mime[marr[1]];
			try {
				str = fs.readFileSync("."+decodeURIComponent(url), 'utf8');
			}
			catch(e) {
				str=null
			}
		}
		else {
			if (marr = url.match(/\.(wav|gz)$/)) usemime = ext_to_mime[marr[1]];
			try {
				str = fs.readFileSync("."+decodeURIComponent(url));
			}
			catch(e) {
				str = null
			}
		}
		if (!str) {
			nogo(res, "404: File not found: " + url);
//debug("Not found");
			return;
		}
//debug("OK: " + (str.length) + " bytes");
		okay(res, usemime);
		res.end(str);
	}//»
	else if (meth == "POST") nogo(res);
	else nogo(res);
}//»

const app =(req,res)=>{//«

	let url_arr = req.url.split("?");
	let len = url_arr.length;
	if (len == 1 || len == 2) {
		let base = url_arr[0];
		let args = url_arr[1];
		let arg_hash = {};
		if (args) {
			let args_arr = args.split("&");
			for (let i=0; i < args_arr.length; i++) {
				let argi = args_arr[i].split("=");
				let key = argi[0];
				let val = argi[1];
				if (!val) val = false;
				arg_hash[key] = val;
			}
		}
		handle_request(req, res, base, arg_hash);
	}
	else {
		nogo(res);
	}
};//»

if (process.env.LOTW_LIVE) {
	https.createServer({
		key: fs.readFileSync(KEY_PATH),
		cert: fs.readFileSync(CERT_PATH)
	}, app).listen(port, hostname)
}
else http.createServer(app).listen(port, hostname);

log(`Site server listening at http://${hostname}:${port}`);

