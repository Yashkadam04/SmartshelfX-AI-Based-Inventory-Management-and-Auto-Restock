import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
    form: FormGroup;
    loading = false;
    sent = false;
    errorMsg = '';

    constructor(private fb: FormBuilder, private http: HttpClient) {
        this.form = this.fb.group({
            email: ['', [Validators.required, Validators.email]]
        });
    }

    get email() { return this.form.get('email')!; }

    submit() {
        this.errorMsg = '';
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        this.loading = true;
        this.http.post(environment.apiUrl + '/auth/forgot-password', { email: this.form.value.email }).subscribe({
            next: () => { this.loading = false; this.sent = true; },
            error: (err) => { this.loading = false; this.errorMsg = err?.error?.error || 'Failed to send email. Please try again.'; }
        });
    }
}