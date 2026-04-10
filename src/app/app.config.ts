import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideAppInitializer, inject } from '@angular/core';
import { DataLoaderService } from './core/services/data-loader.service';
import { SimilarityService } from './core/services/similarity.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(async () => {
      const dataLoader = inject(DataLoaderService);
      const similarity = inject(SimilarityService);

      await dataLoader.loadData();

      const players = dataLoader.players();
      if (players.length > 0) {
        const enriched = await similarity.initializeWorker(players);
        dataLoader.players.set(enriched);
      }
    }),
  ],
};
