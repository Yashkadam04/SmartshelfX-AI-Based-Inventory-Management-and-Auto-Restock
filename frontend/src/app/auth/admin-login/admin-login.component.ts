import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { NotificationService } from '../../shared/services/notification.service';

@Component({
    selector: 'app-admin-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './admin-login.component.html',
    styleUrls: ['./admin-login.component.scss']
})
export class AdminLoginComponent {
    form: FormGroup;
    loading = false;
    showPass = false;
    errorMsg = '';

    constructor(
        private fb: FormBuilder,
        private auth: AuthService,
        private router: Router,
        private notify: NotificationService
    ) {
        this.form = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(4)]]
        });
    }

    get email() { return this.form.get('email')!; }
    get password() { return this.form.get('password')!; }

    submit() {
        this.errorMsg = '';
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        this.loading = true;

        this.auth.login(this.form.value).subscribe({
            next: (res) => {
                if (res.role !== 'ADMIN') {
                    this.auth.logout();
                    this.loading = false;
                    this.errorMsg = 'Access denied. This portal is for Administrators only.';
                    this.notify.error(this.errorMsg);
                    return;
                }
                this.notify.success('Welcome, Administrator ' + res.name + '!');
                this.router.navigate(['/dashboard']);
            },
            error: (err) => {
                this.loading = false;
                const msg = err?.error?.error || err?.message || 'Login failed. Check credentials.';
                this.errorMsg = msg;
                this.notify.error(msg);
            }
        });
    }
}