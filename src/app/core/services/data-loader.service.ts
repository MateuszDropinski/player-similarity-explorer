import { Injectable, signal } from '@angular/core';
import * as XLSX from 'xlsx';
import { type RawPlayer, type ProcessedPlayer } from '../models';
import { validateColumns, filterGKs, rawToProcessed } from './data-processor.service';

@Injectable({ providedIn: 'root' })
export class DataLoaderService {
  readonly players = signal<ProcessedPlayer[]>([]);
  readonly hasData = signal(false);
  readonly isLoading = signal(true);

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      const players = await this.loadXlsx();
      this.players.set(players);
      this.hasData.set(players.length > 0);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadXlsx(): Promise<ProcessedPlayer[]> {
    try {
      const manifestRes = await fetch('data/manifest.json');
      if (!manifestRes.ok) return [];

      const manifest: { files: string[] } = await manifestRes.json();
      if (!manifest.files || manifest.files.length === 0) return [];

      const allPlayers: ProcessedPlayer[] = [];

      for (const filename of manifest.files) {
        const res = await fetch(`data/${filename}`);
        if (!res.ok) {
          console.warn(`Failed to load ${filename}`);
          continue;
        }

        const buffer = await res.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<RawPlayer>(sheet);

        if (rows.length === 0) continue;

        const headers = Object.keys(rows[0]);
        const validation = validateColumns(headers);
        if (!validation.valid) {
          console.warn(`${filename}: missing columns:`, validation.missing);
          continue;
        }

        const outfield = filterGKs(rows);
        const processed = outfield.map(rawToProcessed);
        allPlayers.push(...processed);
      }

      return allPlayers;
    } catch {
      return [];
    }
  }
}
