import { Injectable } from '@angular/core';
import {
  NgbDateAdapter,
  NgbDateParserFormatter,
  NgbDateStruct,
} from '@ng-bootstrap/ng-bootstrap';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Keeps populated dates as 'yyyy-mm-dd'. Empty datepicker models must be
 * null: ng-bootstrap treats an empty string as an invalid date.
 */
@Injectable()
export class IsoDateAdapter extends NgbDateAdapter<string> {
  fromModel(value: string | null): NgbDateStruct | null {
    if (!value) return null;

    const [datePart] = value.toString().split('T');
    const [year, month, day] = datePart.split('-').map(Number);

    if (!year || !month || !day) return null;

    return { year, month, day };
  }

  toModel(date: NgbDateStruct | null): string | null {
    return date ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : null;
  }
}

/**
 * Shows and accepts dd/mm/yyyy on every device. The native date input follows
 * the phone's locale instead, which is why Android showed mm/dd/yyyy while
 * desktop showed dd/mm/yyyy for the same field.
 */
@Injectable()
export class DdMmYyyyDateFormatter extends NgbDateParserFormatter {
  parse(value: string): NgbDateStruct | null {
    if (!value) return null;

    const [day, month, year] = value.trim().split(/[\/\-.\s]+/).map(Number);

    if (!day || !month || !year) return null;

    return { year, month, day };
  }

  format(date: NgbDateStruct | null): string {
    return date ? `${pad(date.day)}/${pad(date.month)}/${date.year}` : '';
  }
}

/** Add to a component's `providers` to make its datepickers read dd/mm/yyyy. */
export const DD_MM_YYYY_DATE_PROVIDERS = [
  { provide: NgbDateAdapter, useClass: IsoDateAdapter },
  { provide: NgbDateParserFormatter, useClass: DdMmYyyyDateFormatter },
];
