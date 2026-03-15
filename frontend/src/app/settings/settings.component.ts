import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
    appName = 'SmartShelfX';
    lowStockThreshold = 10;
    emailNotifications = true;
    autoRestock = false;
    forecastHorizon = '7';
    currency = 'INR';
    saved = false;

    save() {
        this.saved = true;
        setTimeout(() => this.saved = false, 2500);
    }
}