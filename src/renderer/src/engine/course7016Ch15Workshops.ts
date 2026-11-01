import type { WModule } from './workshops'

export const CHAPTER15: WModule = {
  module: '7016 · Ch 15 Campaign Manager',
  workshops: [
    {
      id: '7016-ch15-setup',
      title: 'Start the Batch Executive and Campaign Manager',
      objective: 'Enable and start the services the Campaign Manager needs (Course 7016 p 15-35).',
      note: 'The Batch Executive must be enabled, downloaded and running (Batch Application Manager). Explorer > PROPLUS > Campaign Manager > Properties: tick Enabled. Batch Application Manager > Campaign Manager tab > Start.',
      steps: [
        { id: '7016-15a-1', text: 'Step 1. The Batch Executive is enabled on this node and its equipment is downloaded.', goto: 'explorer' },
        { id: '7016-15a-2', text: 'Steps 2-3. Start the Batch Executive in the Batch Application Manager and verify phases.', goto: 'batchmgr' },
        { id: '7016-15a-3', text: 'Step 4. Enable the Campaign Manager (Properties) and start it on the Campaign Manager tab.', goto: 'batchmgr' }
      ]
    },
    {
      id: '7016-ch15-campaign',
      title: 'Create and control a campaign',
      objective: 'Create InteriorLatex from PRC_PAINT, edit its batches and run it in Auto Start and Manual modes (Course 7016 pp 15-36 to 15-39).',
      note: 'Campaign Manager Operator Interface (connect to PROPLUS): New Campaign InteriorLatex, 2 batches, maximum 1 active; base recipe PRC_PAINT, bind BLENDERS to UM_BL_500 and COLORTANKS to UM_COLOR_100, choose a formula. Edit Batch on batch 2 to use another formula; New Batch adds a third, edit it to the last formula. Auto Start mode: the first batch runs, the second is released and ready, the third stays Defined. Answer the prompts in the BOI. Then Manual mode; when a batch completes use Remove Batch from Executive. After all are removed, Remove Campaign.',
      steps: [
        { id: '7016-15b-1', text: 'Step 6. Create the campaign InteriorLatex: 2 batches, maximum 1 active batch.', goto: 'campaigns' },
        { id: '7016-15b-2', text: 'Steps 7-9. Base recipe PRC_PAINT, bind UM_BL_500 and UM_COLOR_100, select a formula.', goto: 'campaigns' },
        { id: '7016-15b-3', text: 'Steps 10-11. Edit the second batch to another formula.', goto: 'campaigns' },
        { id: '7016-15b-4', text: 'Step 12. Add a third batch and edit it to the last formula.', goto: 'campaigns' },
        { id: '7016-15c-1', text: 'Step 13. Change the campaign mode to Auto Start.', goto: 'campaigns' },
        { id: '7016-15c-2', text: 'Step 14. Batch 1 is Active - Running, batch 2 Active - Ready, batch 3 Defined.', goto: 'campaigns' },
        { id: '7016-15c-3', text: 'Step 16. Change the mode back to Manual.', goto: 'campaigns' },
        { id: '7016-15c-4', text: 'Steps 17-19. Remove each batch from the Batch Executive after it completes.', goto: 'campaigns' },
        { id: '7016-15c-5', text: 'Step 20. Remove the campaign.', goto: 'campaigns' }
      ]
    },
    {
      id: '7016-ch15-optional',
      title: 'Optional: comments, Auto Release and configuration',
      objective: 'Explore the remaining Campaign Manager features (Course 7016 pp 15-8 to 15-34).',
      note: 'Add a campaign comment; try the Auto Release mode; review Campaign Manager Properties (Server, Action Confirmation) or Client Configuration (sequence length, hide completed batches).',
      steps: [
        { id: '7016-15o-1', text: 'Add a comment to a campaign.', goto: 'campaigns' },
        { id: '7016-15o-2', text: 'Try the Auto Release mode.', goto: 'campaigns' },
        { id: '7016-15o-3', text: 'Review or change the Campaign Manager Properties or Client Configuration.', goto: 'explorer' }
      ]
    }
  ]
}
