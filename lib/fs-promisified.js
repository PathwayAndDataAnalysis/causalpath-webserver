const promisifyAll = require('util-promisifyall');
const fs = promisifyAll(require('fs'));

module.exports = fs;
