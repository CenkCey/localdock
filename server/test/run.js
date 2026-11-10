const unit = require('./unit');
const integration = require('./integration');

(async () => {
  await unit.run();
  await integration.run();
  console.log('all tests passed');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
