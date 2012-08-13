var os = require('os');

var measured = require('measured');
var graphite = require('graphite');
var log = require('log');

function Monitor(url) {
  this._collections = {};
  this._intervallId = null;
  this._graphiteClient = graphite.createClient(url);
}
module.exports = Monitor;

Monitor.prototype.collectionName = function(group) {
  return group;
};

Monitor.prototype.getCollection = function(group) {
  var name = this.collectionName(group);
  if (!this._collections[name]) {
    this._collections[name] = new measured.Collection(name);
  }
  return this._collections[name];
};

Monitor.prototype.forEachCollection = function(fn) {
  var self = this;
  Object.keys(self._collections).forEach(function(name) {
    fn(self._collections[name]);
  });
};

Monitor.prototype.updateTimer = function(group, name, value) {
  this.getCollection(group).timer(name).update(value);
};
Monitor.prototype.update = Monitor.prototype.updateTimer;

Monitor.prototype.updateHistogram = function(group, name, value) {
  this.getCollection(group).histogram(name).update(value);
};

Monitor.prototype.mark = function(group, name, value) {
  this.getCollection(group).meter(name).mark(value || 1);
};

Monitor.prototype.gauge = function(group, name, f) {
  this.getCollection(group).gauge(name, f);
};

Monitor.prototype.start = function(group, name) {
  return this.getCollection(group).timer(name).start();
};

Monitor.prototype.end = function() {
  this.forEachCollection(function(collection) {collection.end();});
  this._graphiteClient.end();
  clearInterval(this._intervalId);
};

Monitor.prototype.responseTimeMiddleware = function() {
  var monitor = this;

  return function(req, res, next) {
    if (req._monitoring) {
      return next();
    }
    req._monitoring = true;

    var name = req.route.path.replace(/[^\w]+/g, '_');
    var stopwatch = monitor.start('performance', name);

    var end = res.end;
    res.end = function(chunk, encoding) {
      res.end = end;
      res.end(chunk, encoding);
      stopwatch.end();
    };

    next();
  };
};

Monitor.factory = function factory(url, interval) {
  return function create(cb) {
    var monitor = new Monitor(url);

    function push() {
      monitor.forEachCollection(function(collection) {
        monitor._graphiteClient.write(collection.toJSON(), function(err) {
          if (err) {
            log.error('Graphite.write: %s', err);
          }
        });
      });
    }
    if (interval) {
      log.info('Graphite.interval: %s', interval);
      monitor._intervalId = setInterval(push, interval);
    }
    cb(null, monitor);
  };
};
