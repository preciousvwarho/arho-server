import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AdminJwtAuthGuard } from '../../common/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateAreaDto, UpdateAreaDto } from './dto/area.dto';
import { CreateCountryDto, UpdateCountryDto } from './dto/country.dto';
import { CreateStateDto, UpdateStateDto } from './dto/state.dto';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List active countries' })
  async listCountries() {
    return {
      status: 'success',
      data: { countries: await this.locations.listCountries() },
    };
  }

  @Get('countries/:countryId/states')
  @ApiOperation({ summary: 'List active states in a country' })
  async listStates(@Param('countryId') countryId: string) {
    return {
      status: 'success',
      data: { states: await this.locations.listStates(countryId) },
    };
  }

  @Get('states/:stateId/areas')
  @ApiOperation({ summary: 'List active pickup areas in a state' })
  async listAreas(@Param('stateId') stateId: string) {
    return {
      status: 'success',
      data: { areas: await this.locations.listAreas(stateId) },
    };
  }

  @Post('countries')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async createCountry(@Body() dto: CreateCountryDto) {
    return {
      status: 'success',
      data: { country: await this.locations.createCountry(dto) },
    };
  }

  @Get('countries/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async getCountry(@Param('id') id: string) {
    return {
      status: 'success',
      data: { country: await this.locations.getCountry(id) },
    };
  }

  @Patch('countries/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return {
      status: 'success',
      data: { country: await this.locations.updateCountry(id, dto) },
    };
  }

  @Delete('countries/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async deleteCountry(@Param('id') id: string) {
    return {
      status: 'success',
      data: { country: await this.locations.deleteCountry(id) },
    };
  }

  @Get('states')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listAllStates(@Query('countryId') countryId?: string) {
    return {
      status: 'success',
      data: { states: await this.locations.listAllStates(countryId) },
    };
  }

  @Post('states')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async createState(@Body() dto: CreateStateDto) {
    return {
      status: 'success',
      data: { state: await this.locations.createState(dto) },
    };
  }

  @Get('states/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async getState(@Param('id') id: string) {
    return {
      status: 'success',
      data: { state: await this.locations.getState(id) },
    };
  }

  @Patch('states/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async updateState(@Param('id') id: string, @Body() dto: UpdateStateDto) {
    return {
      status: 'success',
      data: { state: await this.locations.updateState(id, dto) },
    };
  }

  @Delete('states/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async deleteState(@Param('id') id: string) {
    return {
      status: 'success',
      data: { state: await this.locations.deleteState(id) },
    };
  }

  @Get('areas')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async listAllAreas(
    @Query('stateId') stateId?: string,
    @Query('countryId') countryId?: string,
  ) {
    return {
      status: 'success',
      data: { areas: await this.locations.listAllAreas(stateId, countryId) },
    };
  }

  @Post('areas')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async createArea(@Body() dto: CreateAreaDto) {
    return {
      status: 'success',
      data: { area: await this.locations.createArea(dto) },
    };
  }

  @Get('areas/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async getArea(@Param('id') id: string) {
    return {
      status: 'success',
      data: { area: await this.locations.getArea(id) },
    };
  }

  @Patch('areas/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async updateArea(@Param('id') id: string, @Body() dto: UpdateAreaDto) {
    return {
      status: 'success',
      data: { area: await this.locations.updateArea(id, dto) },
    };
  }

  @Delete('areas/:id')
  @ApiBearerAuth()
  @Permissions(AdminPermission.MANAGE_LOCATIONS)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  async deleteArea(@Param('id') id: string) {
    return {
      status: 'success',
      data: { area: await this.locations.deleteArea(id) },
    };
  }
}
