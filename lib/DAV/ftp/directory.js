/*
 * @package jsDAV
 * @subpackage DAV
 * @copyright Copyright(c) 2011 Ajax.org B.V. <info AT ajax DOT org>
 * @author Mike de Boer <info AT mikedeboer DOT nl>
 * @license http://github.com/mikedeboer/jsDAV/blob/master/LICENSE MIT License
 */

var jsDAV             = require("./../../jsdav"),
    jsDAV_Ftp_Node    = require("./node").jsDAV_Ftp_Node,
    jsDAV_Ftp_File    = require("./file").jsDAV_Ftp_File,
    jsDAV_Directory   = require("./../directory").jsDAV_Directory,
    jsDAV_iCollection = require("./../iCollection").jsDAV_iCollection,
    jsDAV_iQuota      = require("./../iQuota").jsDAV_iQuota,

    Fs                = require("fs"),
    Async             = require("./../../../support/async.js"),
    Exc               = require("./../exceptions");

function jsDAV_Ftp_Directory(path, ftp) {
    this.path = (path || "").replace(/\s+[\/]+$/, "");
    this.ftp = ftp;
}

exports.jsDAV_Ftp_Directory = jsDAV_Ftp_Directory;

(function() {
    this.implement(jsDAV_Directory, jsDAV_iCollection, jsDAV_iQuota);

    /**
     * Creates a new file in the directory
     *
     * data is a readable stream resource
     *
     * @param string name Name of the file
     * @param resource data Initial payload
     * @return void
     */
    this.createFile = function(name, data, enc, cbfscreatefile) {
        var newPath = (this.path + "/" + name).replace(/[\/]+$/, "");
        if (data.length === 0) { //ftp lib does not support writing empty files...
            data = new Buffer("empty file");
            enc  = "binary";
        }

        var newFile = new jsDAV_Ftp_File(newPath, this.ftp);
        newFile.put(data, enc, function(err){
            if(err)
                return cbfscreatefile(err);
                
            self.ftp.$cache[newPath] = newFile;
        });
    };

    /**
     * Creates a new subdirectory
     *
     * @param string name
     * @return void
     */
    this.createDirectory = function(name, cbfscreatedir) {
        var newPath = this.path + "/" + name.replace(/[\/]+$/, "");
        var self = this;
        this.ftp.mkdir(newPath, function(err) {
            if (err)
                return cbfscreatedir(err);
            
            var chmod = self.chmod(newPath, '0755', function(err) {
                if (err)
                    return cbfscreatedir(err);
                
                var newDir = new jsDAV_Ftp_Directory(newPath, self.ftp);
                self.ftp.$cache[newPath] = newDir;
            });
            if (!chmod)
                cbfscreatedir(new Exc.jsDAV_Exception_NotImplemented("Could not create directory in "
                + newPath + ". User not authorized or command CHMOD not implemented."));
        });
    };

    /**
     * Returns a specific child node, referenced by its name
     *
     * @param string name
     * @throws Sabre_DAV_Exception_FileNotFound
     * @return Sabre_DAV_INode
     */
    this.getChild = function(name, cbfsgetchild) {
        var path  = (this.path + "/" + name).replace(/[\/]+$/, ""),
            self = this;
console.log('####### Getting child: ', path);
        if (this.ftp.$cache[path])
            return cbfsgetchild(this.ftp.$cache[path]);
        
        this.ftp.stat(path, function(err, stat) {
            if (err || typeof stat == "undefined") {
                return cbfsgetchild(new Exc.jsDAV_Exception_FileNotFound("File with name "
                    + path + " could not be located"));
            }
            cbfsgetchild(null, stat.isDirectory()
                ? self.ftp.$cache[path] = new jsDAV_Ftp_Directory(path, self.ftp)
                : self.ftp.$cache[path] = new jsDAV_Ftp_File(path, self.ftp))
        });
    };

    /**
     * Returns an array with all the child nodes
     *
     * @return Sabre_DAV_INode[]
     */
    this.getChildren = function(cbfsgetchildren) {
        var nodes = [],
            self = this;
        
        this.ftp.readdir(this.path, function(err, listing) {
            if (err)
                return cbfsgetchildren(null, nodes);
            
            Async.list(listing).each(function(node, next) {
                self.getChild(node, function(err, stat) {
                    if (err)
                        return next();
                    
                    nodes.push(stat);
                    next();
                });
            }).end(function() {
                cbfsgetchildren(null, nodes);
            });
        });
    };

    /**
     * Deletes all files in this directory, and then itself
     *
     * @return void
     */
    this["delete"] = function(cbfsdel) {
        this.ftp.rmdir(this.path, cbfsdel);
    };

    /**
     * Returns available diskspace information
     *
     * @return array
     */
    this.getQuotaInfo = function(cbfsquota) {
        // @todo: impl. ftp.statvfs();
        return cbfsquota(null, [0, 0]);
    };
}).call(jsDAV_Ftp_Directory.prototype = new jsDAV_Ftp_Node());