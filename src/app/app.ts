import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CalculatorSettingsButtonComponent } from './calculator-settings-button.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CalculatorSettingsButtonComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
