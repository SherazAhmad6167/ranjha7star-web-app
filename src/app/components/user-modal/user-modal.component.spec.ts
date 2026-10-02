import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastService } from '../../shared/toast/toast.service';

import { UserModalComponent } from './user-modal.component';

describe('UserModalComponent subscriber validation', () => {
  let component: UserModalComponent;
  let fixture: ComponentFixture<UserModalComponent>;
  let toastr: jasmine.SpyObj<ToastService>;
  let activeModal: jasmine.SpyObj<NgbActiveModal>;

  // Imports have no birth date, store an unknown phone as "0", and omit cable.
  const importedSubscriber = {
    id: 'nava-pind-subscriber',
    internet_id: '01npmuhammadanwer',
    user_name: 'M Anwar',
    mobile_no: '0',
    sublocality: 'Nava Pind',
    address: 'Nava Pind',
    installation_date: '2025-01-01',
    connection_type: 'internet',
    select_package: 'n-2mbps',
    internet_discount: 'no_discount',
    internet_package_fee: 1500,
    customer_status: 'active',
  };

  function loadSubscriber(overrides: Record<string, unknown> = {}): void {
    component.editMode = true;
    component.userData = { ...importedSubscriber, ...overrides };
    component.editForm();
    fixture.detectChanges();
  }

  function birthDateInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('[formControlName="date_of_birth"]');
  }

  function typeBirthDate(value: string): void {
    const input = birthDateInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    toastr = jasmine.createSpyObj<ToastService>('ToastService', ['error', 'success', 'info']);
    activeModal = jasmine.createSpyObj<NgbActiveModal>('NgbActiveModal', ['close', 'dismiss']);
    spyOn(localStorage, 'getItem').and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [UserModalComponent],
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: ToastService, useValue: toastr },
        { provide: NgbActiveModal, useValue: activeModal },
        { provide: NgbModal, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserModalComponent);
    component = fixture.componentInstance;
    spyOn(component, 'loadInternetAreas').and.resolveTo();
    spyOn(component, 'loadCompanies').and.resolveTo();
    spyOn(component, 'loadInternetPackages').and.resolveTo();
    spyOn(component, 'loadCablePackages').and.resolveTo();
    spyOn(component, 'loadCompanyDetails').and.resolveTo();
    spyOn(component, 'checkWhatsAppNumber').and.resolveTo(false);
    spyOn(component, 'sendWelcomeMessage');
    component.internetAreas = [{ sublocality: 'Nava Pind', subAreas: [] }];
    component.internetPackages = [{ package_name: 'n-2mbps', sales_price: 1500 }];
    fixture.detectChanges();
  });

  for (const [description, overrides] of [
    ['missing', {}],
    ['empty string', { date_of_birth: '' }],
    ['null', { date_of_birth: null }],
  ] as const) {
    it(`allows an imported subscriber with ${description} optional birth date`, () => {
      loadSubscriber(overrides);

      expect(birthDateInput().value).toBe('');
      expect(component.userForm.get('date_of_birth')?.errors).toBeNull();
      expect(component.userForm.valid).toBeTrue();
    });
  }

  it('does not invalidate the initial form solely because its optional birth date is blank', () => {
    expect(component.userForm.get('date_of_birth')?.errors).toBeNull();
  });

  it('displays a saved ISO birth date as day/month/year and keeps it valid', () => {
    loadSubscriber({ date_of_birth: '1990-06-15' });

    expect(birthDateInput().value).toBe('15/06/1990');
    expect(component.userForm.get('date_of_birth')?.value).toBe('1990-06-15');
    expect(component.userForm.valid).toBeTrue();
  });

  it('allows clearing a previously saved birth date', () => {
    loadSubscriber({ date_of_birth: '1990-06-15' });
    typeBirthDate('');

    expect(component.userForm.get('date_of_birth')?.errors).toBeNull();
    expect(component.userForm.valid).toBeTrue();
  });

  it('rejects an impossible typed birth date and shows a field error', async () => {
    loadSubscriber();
    typeBirthDate('31/02/1990');
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.userForm.get('date_of_birth')?.hasError('ngbDate')).toBeTrue();
    expect(component.userForm.invalid).toBeTrue();
    const fieldError = birthDateInput().closest('.um-field')?.querySelector('.um-err');
    expect(fieldError?.textContent?.trim()).toBeTruthy();
    expect(toastr.error).toHaveBeenCalledWith('Enter a valid date of birth, or leave it blank.');
    expect(activeModal.close).not.toHaveBeenCalled();
    expect(component.checkWhatsAppNumber).not.toHaveBeenCalled();
    expect(component.sendWelcomeMessage).not.toHaveBeenCalled();
  });

  it('continues rejecting genuinely missing required subscriber fields', async () => {
    loadSubscriber({ user_name: '' });
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.userForm.get('user_name')?.hasError('required')).toBeTrue();
    expect(component.userForm.invalid).toBeTrue();
    expect(toastr.error).toHaveBeenCalledWith('Please fill all required fields');
    expect(activeModal.close).not.toHaveBeenCalled();
  });

  it('accepts a zero internet fee while ignoring unused cable fields', () => {
    loadSubscriber({ internet_package_fee: 0, internet_discount: 'full_free' });

    expect(component.userForm.get('internet_package_fee')?.value).toBe(0);
    for (const name of ['pkg_cable', 'cable_discount', 'cable_package_fee']) {
      expect(component.userForm.get(name)?.disabled).withContext(name).toBeTrue();
    }
    expect(component.userForm.valid).toBeTrue();
  });

  it('preserves a numeric legacy phone placeholder as text', () => {
    loadSubscriber({ mobile_no: 0 });

    expect(component.userForm.get('mobile_no')?.value).toBe('0');
    expect(component.userForm.valid).toBeTrue();
    expect(component.formatPhoneNumber(component.userForm.value.mobile_no)).toBe('0');
  });
});
