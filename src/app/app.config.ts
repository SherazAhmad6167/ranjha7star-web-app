import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  provideFirestore,
} from '@angular/fire/firestore';

import { environment } from '../environment/environment';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    provideFirebaseApp(() => initializeApp(environment.firebase)),

    provideFirestore(() =>
      initializeFirestore(initializeApp(environment.firebase), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      })
    ),

    provideAnimations(),
    provideToastr({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
    }),
  ],
};