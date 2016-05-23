/*jshint globalstrict:false, strict:false */
/*global assertTrue, assertEqual, fail */

////////////////////////////////////////////////////////////////////////////////
/// @brief test synchronous replication in the cluster
///
/// @file js/server/tests/shell/shell-synchronous-replication-cluster.js
///
/// DISCLAIMER
///
/// Copyright 2016-2016 ArangoDB GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is ArangoDB GmbH, Cologne, Germany
///
/// @author Max Neunhoeffer
/// @author Copyright 2016, ArangoDB GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

const jsunity = require("jsunity");

const arangodb = require("@arangodb");
const db = arangodb.db;
const ERRORS = arangodb.errors;
const _ = require("lodash");
const print = require("internal").print;
const wait = require("internal").wait;
const suspendExternal = require("internal").suspendExternal;
const continueExternal = require("internal").continueExternal;


////////////////////////////////////////////////////////////////////////////////
/// @brief test suite
////////////////////////////////////////////////////////////////////////////////

function SynchronousReplicationSuite () {
  'use strict';
  var cn = "UnitTestSyncRep";
  var c;
  var cinfo;
  var ccinfo;
  var shards;

////////////////////////////////////////////////////////////////////////////////
/// @brief find out servers for the system collections
////////////////////////////////////////////////////////////////////////////////

  function findCollectionServers(database, collection) {
    var cinfo = global.ArangoClusterInfo.getCollectionInfo(database, collection);
    var shard = Object.keys(cinfo.shards)[0];
    return cinfo.shards[shard];
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief wait for synchronous replication
////////////////////////////////////////////////////////////////////////////////

  function waitForSynchronousReplication(database) {
    cinfo = global.ArangoClusterInfo.getCollectionInfo(database, cn);
    shards = Object.keys(cinfo.shards);
    var count = 0;
    while (++count <= 120) {
      ccinfo = shards.map(
        s => global.ArangoClusterInfo.getCollectionInfoCurrent(database, cn, s)
      );
      let replicas = ccinfo.map(s => s.servers.length);
      if (_.all(replicas, x => x === 2)) {
        print("Replication up and running!");
        return true;
      }
      wait(0.5);
    }
    return false;
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief fail the follower
////////////////////////////////////////////////////////////////////////////////

  function failFollower() {
    var follower = cinfo.shards[shards[0]][1];
    var endpoint = global.ArangoClusterInfo.getServerEndpoint(follower);
    // Now look for instanceInfo:
    var pos = _.findIndex(global.instanceInfo.arangods,
                          x => x.endpoint === endpoint);
    assertTrue(pos >= 0);
    assertTrue(suspendExternal(global.instanceInfo.arangods[pos].pid));
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief heal the follower
////////////////////////////////////////////////////////////////////////////////

  function healFollower() {
    var follower = cinfo.shards[shards[0]][1];
    var endpoint = global.ArangoClusterInfo.getServerEndpoint(follower);
    // Now look for instanceInfo:
    var pos = _.findIndex(global.instanceInfo.arangods,
                          x => x.endpoint === endpoint);
    assertTrue(pos >= 0);
    assertTrue(continueExternal(global.instanceInfo.arangods[pos].pid));
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief produce failure
////////////////////////////////////////////////////////////////////////////////

  function makeFailure(failure) {
    if (failure.follower) {
      failFollower();
/*    } else {
      failLeader(); // TODO: function does not exist 
*/      
    }
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief heal failure
////////////////////////////////////////////////////////////////////////////////

  function healFailure(failure) {
    if (failure.follower) {
      healFollower();
/*    } else {
      healLeader(); // TODO: function does not exist 
*/      
    }
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief basic operations, with various failure modes:
////////////////////////////////////////////////////////////////////////////////

  function runBasicOperations(failure, healing) {
    if (failure.place === 1) { makeFailure(failure); }

    // Insert with check:
    var id = c.insert({Hallo:12});
    assertEqual(1, c.count());

    if (healing.place === 1) { healFailure(healing); }
    if (failure.place === 2) { makeFailure(failure); }

    var doc = c.document(id._key);
    assertEqual(12, doc.Hallo);

    if (healing.place === 2) { healFailure(healing); }
    if (failure.place === 3) { makeFailure(failure); }

    var ids = c.insert([{Hallo:13}, {Hallo:14}]);
    assertEqual(3, c.count());
    assertEqual(2, ids.length);

    if (healing.place === 3) { healFailure(healing); }
    if (failure.place === 4) { makeFailure(failure); }

    var docs = c.document([ids[0]._key, ids[1]._key]);
    assertEqual(2, docs.length);
    assertEqual(13, docs[0].Hallo);
    assertEqual(14, docs[1].Hallo);

    if (healing.place === 4) { healFailure(healing); }
    if (failure.place === 5) { makeFailure(failure); }

    // Replace with check:
    c.replace(id._key, {"Hallo": 100});

    if (healing.place === 5) { healFailure(healing); }
    if (failure.place === 6) { makeFailure(failure); }

    doc = c.document(id._key);
    assertEqual(100, doc.Hallo);

    if (healing.place === 6) { healFailure(healing); }
    if (failure.place === 7) { makeFailure(failure); }

    c.replace([ids[0]._key, ids[1]._key], [{Hallo:101}, {Hallo:102}]);

    if (healing.place === 7) { healFailure(healing); }
    if (failure.place === 8) { makeFailure(failure); }

    docs = c.document([ids[0]._key, ids[1]._key]);
    assertEqual(2, docs.length);
    assertEqual(101, docs[0].Hallo);
    assertEqual(102, docs[1].Hallo);

    if (healing.place === 8) { healFailure(healing); }
    if (failure.place === 9) { makeFailure(failure); }

    // Update with check:
    c.update(id._key, {"Hallox": 105});

    if (healing.place === 9) { healFailure(healing); }
    if (failure.place === 10) { makeFailure(failure); }

    doc = c.document(id._key);
    assertEqual(100, doc.Hallo);
    assertEqual(105, doc.Hallox);

    if (healing.place === 10) { healFailure(healing); }
    if (failure.place === 11) { makeFailure(failure); }

    c.update([ids[0]._key, ids[1]._key], [{Hallox:106}, {Hallox:107}]);

    if (healing.place === 11) { healFailure(healing); }
    if (failure.place === 12) { makeFailure(failure); }

    docs = c.document([ids[0]._key, ids[1]._key]);
    assertEqual(2, docs.length);
    assertEqual(101, docs[0].Hallo);
    assertEqual(102, docs[1].Hallo);
    assertEqual(106, docs[0].Hallox);
    assertEqual(107, docs[1].Hallox);

    if (healing.place === 12) { healFailure(healing); }
    if (failure.place === 13) { makeFailure(failure); }

    // AQL:
    var q = db._query(`FOR x IN @@cn
                         FILTER x.Hallo > 0
                         SORT x.Hallo
                         RETURN {"Hallo": x.Hallo}`, {"@cn": cn});
    docs = q.toArray();
    assertEqual(3, docs.length);
    assertEqual([{Hallo:100}, {Hallo:101}, {Hallo:102}], docs);

    if (healing.place === 13) { healFailure(healing); }
    if (failure.place === 14) { makeFailure(failure); }

    // Remove with check:
    c.remove(id._key);

    if (healing.place === 14) { healFailure(healing); }
    if (failure.place === 15) { makeFailure(failure); }

    try {
      doc = c.document(id._key);
      fail();
    }
    catch (e1) {
      assertEqual(ERRORS.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code, e1.errorNum);
    }
    assertEqual(2, c.count());

    if (healing.place === 15) { healFailure(healing); }
    if (failure.place === 16) { makeFailure(failure); }

    c.remove([ids[0]._key, ids[1]._key]);

    if (healing.place === 16) { healFailure(healing); }
    if (failure.place === 17) { makeFailure(failure); }

    docs = c.document([ids[0]._key, ids[1]._key]);
    assertEqual(2, docs.length);
    assertTrue(docs[0].error);
    assertTrue(docs[1].error);

    if (healing.place === 17) { healFailure(healing); }
  }

////////////////////////////////////////////////////////////////////////////////
/// @brief the actual tests
////////////////////////////////////////////////////////////////////////////////

  return {

////////////////////////////////////////////////////////////////////////////////
/// @brief set up
////////////////////////////////////////////////////////////////////////////////

    setUp : function () {
      console.error("Dumdidum");
      var systemCollServers = findCollectionServers("_system", "_graphs");
      console.error("Dumdidum");
      while (true) {
        console.error("Dumdidei");
        db._drop(cn);
        c = db._create(cn, {numberOfShards: 1, replicationFactor: 2});
        var servers = findCollectionServers("_system", cn);
        console.error("Dideldum:", systemCollServers, servers, _.intersection(systemCollServers, servers));
        if (_.intersection(systemCollServers, servers).length === 0) {
          return;
        }
        console.info("Need to recreate collection to avoid system collection servers.");
      }
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief tear down
////////////////////////////////////////////////////////////////////////////////

    tearDown : function () {
      db._drop(cn);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief check whether we have access to global.instanceInfo
////////////////////////////////////////////////////////////////////////////////

    testCheckInstanceInfo : function () {
      assertTrue(global.instanceInfo !== undefined);
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief check if a synchronously replicated collection gets online
////////////////////////////////////////////////////////////////////////////////

    testSetup : function () {
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief run a standard check without failures:
////////////////////////////////////////////////////////////////////////////////

    testBasicOperations : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({}, {});
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief run a standard check with failures:
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFailureFollower : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      failFollower();
      runBasicOperations({}, {});
      healFollower();
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 1
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail1 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:1, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 2
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail2 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:2, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 3
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail3 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:3, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 4
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail4 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:4, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 5
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail5 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:5, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 6
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail6 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:6, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 7
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail7 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:7, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 8
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail8 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:8, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 9
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail9 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:9, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 10
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail10 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:10, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 11
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail11 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:11, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 12
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail12 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:12, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 13
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail13 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:13, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 14
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail14 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:14, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 15
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail15 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:15, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 16
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail16 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:16, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief fail in place 17
////////////////////////////////////////////////////////////////////////////////

    testBasicOperationsFollowerFail17 : function () {
      assertTrue(waitForSynchronousReplication("_system"));
      runBasicOperations({place:17, follower:true}, {place:17, follower: true});
      assertTrue(waitForSynchronousReplication("_system"));
    },

////////////////////////////////////////////////////////////////////////////////
/// @brief just to allow a trailing comma at the end of the last test
////////////////////////////////////////////////////////////////////////////////

    testDummy : function () {
      assertEqual(12, 12);
      wait(15);
    }

  };
}


////////////////////////////////////////////////////////////////////////////////
/// @brief executes the test suite
////////////////////////////////////////////////////////////////////////////////

jsunity.run(SynchronousReplicationSuite);

return jsunity.done();

