import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const v = control.value || '';
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@#_]).{8,}$/.test(v) ? null : { passwordStrength: true };
}

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
    const pw = group.get('newPassword')?.value;
    const cpw = group.get('confirmPassword')?.value;
    return pw && cpw && pw !== cpw ? { passwordMismatch: true } : null;
}

@Component({
    selector: 'app-reset-password',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
    form: FormGroup;
    loading = false;
    showNew = false;
    showConfirm = false;
    showPwTooltip = false;
    showCpTooltip = false;
    successPopup = false;
    errorMsg = '';
    token = '';

    pwRules = [
        { label: 'Minimum 8 characters', regex: /.{8,}/ },
        { label: 'At least one uppercase (A-Z)', regex: /[A-Z]/ },
        { label: 'At least one lowercase (a-z)', regex: /[a-z]/ },
        { label: 'At least one number (0-9)', regex: /[0-9]/ },
        { label: 'At least one special (@, #, _)', regex: /[@#_]/ }
    ];

    constructor(private fb: FormBuilder, private http: HttpClient, private route: ActivatedRoute, private router: Router) {
        this.form = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            newPassword: ['', [Validators.required, passwordStrengthValidator]],
            confirmPassword: ['', Validators.required]
        }, { validators: confirmPasswordValidator });
    }

    ngOnInit() {
        this.token = this.route.snapshot.queryParamMap.get('token') || '';
        if (!this.token) { this.errorMsg = 'Invalid or missing reset token. Please request a new link.'; }
    }

    get f() { return this.form.controls; }
    get pwVal() { return this.f['newPassword'].value || ''; }
    rulePass(regex: RegExp): boolean { return regex.test(this.pwVal); }

    submit() {
        this.errorMsg = '';
        if (this.form.invalid) { this.form.markAllAsTouched(); return; }
        if (!this.token) { this.errorMsg = 'Invalid reset token.'; return; }
        this.loading = true;
        this.http.post(environment.apiUrl + '/auth/reset-password', {
            token: this.token,
            email: this.form.value.email,
            password: this.form.value.newPassword
        }).subscribe({
            next: () => {
                this.loading = false;
                this.successPopup = true;
                const emailVal = this.form.value.email;
                const passVal = this.form.value.newPassword;
                this.triggerPasswordManagerSave(emailVal, passVal);
            },
            error: (err) => {
                this.loading = false;
                this.errorMsg = err?.error?.error || 'Reset failed. Please request a new link.';
            }
        });
    }

    triggerPasswordManagerSave(email: string, password: string) {
        const tempForm = document.createElement('form');
        tempForm.style.display = 'none';
        const emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.autocomplete = 'email';
        emailInput.name = 'email';
        emailInput.value = email;
        const passInput = document.createElement('input');
        passInput.type = 'password';
        passInput.autocomplete = 'new-password';
        passInput.name = 'password';
        passInput.value = password;
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        tempForm.appendChild(emailInput);
        tempForm.appendChild(passInput);
        tempForm.appendChild(submitBtn);
        document.body.appendChild(tempForm);
        submitBtn.click();
        setTimeout(() => document.body.removeChild(tempForm), 500);
    }

    goToLogin() {
        this.successPopup = false;
        this.router.navigate(['/auth/login']);
    }
}