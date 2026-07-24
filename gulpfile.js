import gulp from 'gulp';
import definePrototypeKitGulpTasks from '@ons/prototype-kit/defineGulpTasks.js';

definePrototypeKitGulpTasks(gulp);

gulp.task('prototype-kit:copy-json-files', () => {
  return gulp.src('./src/**/*.json').pipe(gulp.dest('./build'));
});

gulp.task('prototype-kit:start-dev-server', async () => {
  await import('./server.js');
});

gulp.task(
  'prototype-kit:start',
  gulp.series(
    'prototype-kit:build-assets',
    'prototype-kit:copy-json-files',
    'prototype-kit:watch-and-build',
    'prototype-kit:start-dev-server',
  ),
);

gulp.task(
  'prototype-kit:build',
  gulp.series('prototype-kit:build-assets', 'prototype-kit:copy-json-files', 'prototype-kit:build-pages'),
);
