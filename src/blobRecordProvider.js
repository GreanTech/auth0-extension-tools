const _ = require('lodash');
const uuid = require('node-uuid');
const promiseRetry = require('promise-retry');

const seriesQueue = require('./seriesQueue');
const ArgumentError = require('./errors').ArgumentError;
const NotFoundError = require('./errors').NotFoundError;
const ValidationError = require('./errors').ValidationError;

const getDataForCollection = function(storageContext, collectionName) {
  return storageContext.read(collectionName)
    .then(function(data) {
      data[collectionName] = data[collectionName] || [];
      return data;
    });
};

const withRetry = function(storageContext, action) {
  const retryOptions = {
    retries: 10,
    factor: 2,
    minTimeout: 100,
    maxTimeout: Infinity,
    randomize: false
  };

  return function() {
    return promiseRetry(function(retry) {
      return action()
        .catch(function(err) {
          const writeRetryCondition =
            storageContext.writeRetryCondition ||
            function() { return false; };
          if (writeRetryCondition(err)) {
            return retry(err);
          }

          throw err;
        });
    }, retryOptions);
  };
};

/**
 * Create a new BlobRecordProvider.
 * @param {Object} storageContext The storage context.
 * @constructor
 */
function BlobRecordProvider(storageContext, options) {
  if (storageContext === null || storageContext === undefined) {
    throw new ArgumentError('Must provide a storage context');
  }

  this.storageContext = storageContext;
  this.queue = seriesQueue();
  this.options = options || {
    concurrentWrites: true
  };
}

/**
 * Write to the underlying storage layer
 * @param {string} action Action to execute.
 */
BlobRecordProvider.prototype.write = function(storageContext, action) {
  const actionWithRetry = withRetry(storageContext, action);

  // Concurrent writes are allowed.
  if (this.options.concurrentWrites) {
    return actionWithRetry();
  }

  // Concurrent writes are not allowed, process them sequantially.
  const queue = this.queue;
  return new Promise(function(resolve, reject) {
    queue(actionWithRetry, function(err, res) {
      if (err) {
        return reject(err);
      }

      return resolve(res);
    });
  });
};

/**
 * Get all records for a collection.
 * @param {string} collectionName The name of the collection.
 * @return {Array} The records.
 */
BlobRecordProvider.prototype.getAll = function(collectionName) {
  return getDataForCollection(this.storageContext, collectionName)
    .then(function(data) {
      return data[collectionName];
    });
};

/**
 * Get a single record from a collection.
 * @param {string} collectionName The name of the collection.
 * @param {string} identifier The identifier of the record.
 * @return {Object} The record.
 */
BlobRecordProvider.prototype.get = function(collectionName, identifier) {
  return this.getAll(collectionName)
    .then(function(records) {
      const record = _.find(records, function(r) { return r._id === identifier; });
      if (!record) {
        return Promise.reject(
          new NotFoundError('The record ' + identifier + ' in ' + collectionName + ' does not exist.')
        );
      }

      return record;
    });
};

/**
 * Create a record in a collection.
 * @param {string} collectionName The name of the collection.
 * @param {Object} record The record.
 * @return {Object} The record.
 */
BlobRecordProvider.prototype.create = function(collectionName, record) {
  const storageContext = this.storageContext;
  return this.write(storageContext, function() {
    return getDataForCollection(storageContext, collectionName)
      .then(function(data) {
        if (!record._id) {
          record._id = uuid.v4();
        }

        const index = _.findIndex(data[collectionName], function(r) { return r._id === record._id; });
        if (index > -1) {
          return Promise.reject(
            new ValidationError('The record ' + record._id + ' in ' + collectionName + ' already exists.')
          );
        }

        // Add to dataset.
        data[collectionName].push(record);

        // Save.
        return storageContext.write(data)
          .then(function() {
            return record;
          });
      });
  });
};

/**
 * Update a record in a collection.
 * @param {string} collectionName The name of the collection.
 * @param {string} identifier The identifier of the record to update.
 * @param {Object} record The record.
 * @param {boolean} upsert Flag allowing to upsert if the record does not exist.
 * @return {Object} The record.
 */
BlobRecordProvider.prototype.update = function(collectionName, identifier, record, upsert) {
  const storageContext = this.storageContext;
  return this.write(storageContext, function() {
    return getDataForCollection(storageContext, collectionName)
      .then(function(data) {
        const index = _.findIndex(data[collectionName], function(r) { return r._id === identifier; });
        if (index < 0 && !upsert) {
          throw new NotFoundError('The record ' + identifier + ' in ' + collectionName + ' does not exist.');
        }

        // Update record.
        const updatedRecord = _.extend({ _id: identifier }, index < 0 ? { } : data[collectionName][index], record);
        if (index < 0) {
          data[collectionName].push(updatedRecord);
        } else {
          data[collectionName][index] = updatedRecord;
        }

        // Save.
        return storageContext.write(data)
          .then(function() {
            return updatedRecord;
          });
      });
  });
};

/**
 * Delete a record in a collection.
 * @param {string} collectionName The name of the collection.
 * @param {string} identifier The identifier of the record to update.
 */
BlobRecordProvider.prototype.delete = function(collectionName, identifier) {
  const storageContext = this.storageContext;
  return this.write(storageContext, function() {
    return getDataForCollection(storageContext, collectionName)
      .then(function(data) {
        const index = _.findIndex(data[collectionName], function(r) { return r._id === identifier; });
        if (index < 0) {
          return false;
        }

        // Remove the record.
        data[collectionName].splice(index, 1);

        // Save.
        return storageContext.write(data)
          .then(function() {
            return true;
          });
      });
  });
};

/**
 * Module exports.
 * @type {function}
 */
module.exports = BlobRecordProvider;
