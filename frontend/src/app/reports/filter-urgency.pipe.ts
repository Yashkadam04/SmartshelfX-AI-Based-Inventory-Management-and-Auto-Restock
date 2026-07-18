import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'filterUrgency', standalone: true })
export class FilterUrgencyPipe implements PipeTransform {
    transform(items: any[], urgency: string): number {
        if (!items) return 0;
        return items.filter(i => i.urgency === urgency).length;
    }
}