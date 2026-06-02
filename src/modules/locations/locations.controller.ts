import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
