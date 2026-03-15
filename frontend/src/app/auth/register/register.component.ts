import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { NotificationService } from '../../shared/services/notification.service';

function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const v = control.value || '';
    const ok = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@#_]).{8,}$/.test(v);
    return ok ? null : { passwordStrength: true };
}

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
    const pw = group.get('password')?.value;
    const cpw = group.get('confirmPassword')?.value;
    return pw && cpw && pw !== cpw ? { passwordMismatch: true } : null;
}

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
    form: FormGroup;
    loading = false;
    showPass = false;
    showConfirm = false;
    showPwTooltip = false;
    showCpTooltip = false;
    errorMsg = '';

    pwRules = [
        { label: 'Minimum 8 characters', regex: /.{8,}/ },
        { label: 'At least one uppercase (A-Z)', regex: /[A-Z]/ },
        { label: 'At least one lowercase (a-z)', regex: /[a-z]/ },
        { label: 'At least one number (0-9)', regex: /[0-9]/ },
        { label: 'At least one special (@, #, _)', regex: /[@#_]/ }
    ];

    constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private notify: NotificationService) {
        this.form = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            username: ['', Validators.required],
            email: ['', [Validators.required, Validators.email]],
            role: ['', Validators.required],
            password: ['', [Validators.required, passwordStrengthValidator]],
            confirmPassword: ['', Validators.required]
        }, { validators: confirmPasswordValidator });
    }

    get f() { return this.form.controls; }
    get pwVal() { return this.f['password'].value || ''; }

    rulePass(regex: RegExp): boolean { return regex.test(this.pwVal); }

    submit() {
        this.errorMsg = '';
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        this.loading = true;
        const payload = {
            name: this.form.value.name.trim(),
            username: this.form.value.username.trim(),
            email: this.form.value.email.trim().toLowerCase(),
            role: this.form.value.role,
            password: this.form.value.password
        };
        this.auth.register(payload).subscribe({
            next: () => { this.notify.success('Account created! Please log in.'); this.router.navigate(['/auth/login']); },
            error: (err) => {
                this.loading = false;
                const msg = err?.error?.error || err?.message || 'Registration failed.';
                this.errorMsg = msg; this.notify.error(msg);
            }
        });
    }
}