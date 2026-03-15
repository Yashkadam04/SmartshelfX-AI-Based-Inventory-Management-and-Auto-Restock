import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
    constructor(private snack: MatSnackBar) { }

    success(msg: string, duration = 3000): void {
        this.snack.open('✅  ' + msg, 'Dismiss', {
            duration,
            panelClass: ['snack-success'],
            horizontalPosition: 'right',
            verticalPosition: 'top'
        });
    }

    error(msg: string, duration = 4000): void {
        this.snack.open('❌  ' + msg, 'Dismiss', {
            duration,
            panelClass: ['snack-error'],
            horizontalPosition: 'right',
            verticalPosition: 'top'
        });
    }

    info(msg: string, duration = 3000): void {
        this.snack.open('ℹ️  ' + msg, 'OK', {
            duration,
            horizontalPosition: 'right',
            verticalPosition: 'top'
        });
    }

    warn(msg: string, duration = 3500): void {
        this.snack.open('⚠️  ' + msg, 'OK', {
            duration,
            panelClass: ['snack-warn'],
            horizontalPosition: 'right',
            verticalPosition: 'top'
        });
    }
}