import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    return this.authService.login(user);
  }

  @Public()
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  async refresh(@CurrentUser() user: { id: string }) {
    return this.authService.refreshToken(user.id);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }

  @Post('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@CurrentUser() user: any) {
    return user;
  }
}
