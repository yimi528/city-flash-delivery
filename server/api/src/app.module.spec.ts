import { Test } from '@nestjs/testing'
import { AppModule } from './app.module'

describe('AppModule', () => {
  it('resolves the complete application dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    await moduleRef.close()
  })
})
